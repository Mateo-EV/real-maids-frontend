import { isPlatformBrowser } from "@angular/common"
import { HttpClient, HttpErrorResponse, HttpParams } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of, switchMap } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { Result } from "@/app/shared/utils/result"
import { Lang, User } from "../../domain/entities/user.entity"
import { UserError, UserErrorCode } from "../../domain/errors/user.error"
import { CreateUserParams } from "../../domain/params/create-user.params"
import { UpdateUserParams } from "../../domain/params/update-user.params"

export const dtoRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new UserError("INVALID_RESPONSE")
  return value as Record<string, unknown>
}
export const dtoText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0
export const dtoId = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= -2147483648 &&
  value <= 2147483647
export function dtoDate(value: unknown): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    throw new UserError("INVALID_RESPONSE")
  const date = new Date(value)
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10))
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (!Number.isFinite(date.getTime()) || month < 1 || month > 12 || day < 1 || day > days)
    throw new UserError("INVALID_RESPONSE")
  return date
}
function userDto(value: unknown): User {
  const p = dtoRecord(value)
  if (
    !dtoId(p["idUsuario"]) ||
    !dtoId(p["idRol"]) ||
    !dtoText(p["nombre"]) ||
    !dtoText(p["correo"]) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p["correo"]) ||
    (p["idioma"] !== Lang.ES && p["idioma"] !== Lang.EN) ||
    typeof p["activo"] !== "boolean" ||
    !("ultimoAcceso" in p)
  )
    throw new UserError("INVALID_RESPONSE")
  return User.create(
    p["idUsuario"],
    p["nombre"],
    p["correo"],
    p["idioma"],
    p["activo"],
    dtoDate(p["fechaCreacion"]),
    dtoDate(p["fechaActualizacion"]),
    p["idRol"],
    p["ultimoAcceso"] === null ? null : dtoDate(p["ultimoAcceso"])
  )
}
function userForId(value: unknown, id: number): User {
  const user = userDto(value)
  if (user.id !== id) throw new UserError("INVALID_RESPONSE")
  return user
}
export function userTransportCode(error: unknown): UserErrorCode {
  if (error instanceof UserError) return error.code
  if (error instanceof AuthError) {
    return error.code === "FORBIDDEN"
      ? "FORBIDDEN"
      : error.code === "NETWORK"
        ? "NETWORK"
        : error.code === "UNCONFIGURED"
          ? "UNCONFIGURED"
          : error.code === "INVALID_CREDENTIALS" ||
              error.code === "COORDINATION" ||
              error.code === "CANCELLED"
            ? "UNAUTHENTICATED"
            : "UNEXPECTED"
  }
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 0:
        return "NETWORK"
      case 400:
        return "VALIDATION"
      case 401:
        return "UNAUTHENTICATED"
      case 403:
        return "FORBIDDEN"
      case 404:
        return "USER_NOT_FOUND"
      case 409:
        return "EMAIL_ALREADY_EXISTS"
    }
  }
  return "UNEXPECTED"
}

@Injectable({ providedIn: "root" })
export class UserHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))

  private request<T>(
    send: () => Observable<unknown>,
    parse: (value: unknown) => T
  ): Observable<Result<T, UserError>> {
    return defer(() => {
      if (!this.browser || !this.origin) return of(Result.failure(new UserError("UNCONFIGURED")))
      return defer(send).pipe(
        map(value => Result.success(parse(value))),
        catchError(error => of(Result.failure(new UserError(userTransportCode(error)))))
      )
    })
  }
  getUsers(): Observable<Result<User[], UserError>> {
    return this.request(
      () =>
        this.http.get<unknown>(`${this.origin}/api/usuarios`, {
          params: new HttpParams().set("pagina", 0).set("tamanio", 500),
          transferCache: false
        }),
      value => {
        const p = dtoRecord(value)
        const page = p["pagina"],
          size = p["tamanio"],
          total = p["totalElementos"],
          totalPages = p["totalPaginas"]
        if (
          !Array.isArray(p["contenido"]) ||
          typeof page !== "number" ||
          !Number.isSafeInteger(page) ||
          page < 0 ||
          typeof size !== "number" ||
          !Number.isSafeInteger(size) ||
          size < 1 ||
          typeof total !== "number" ||
          !Number.isSafeInteger(total) ||
          total < 0 ||
          typeof totalPages !== "number" ||
          !Number.isSafeInteger(totalPages) ||
          totalPages < 0 ||
          totalPages !== Math.ceil(total / size) ||
          p["contenido"].length > size ||
          p["contenido"].length > total ||
          page !== 0
        )
          throw new UserError("INVALID_RESPONSE")
        const items = p["contenido"].map(userDto)
        if (new Set(items.map(user => user.id)).size !== items.length)
          throw new UserError("INVALID_RESPONSE")
        return items
      }
    )
  }
  getUserById(id: number) {
    return this.request(
      () => this.http.get<unknown>(`${this.origin}/api/usuarios/${id}`, { transferCache: false }),
      value => userForId(value, id)
    )
  }
  createUser(params: CreateUserParams) {
    const body = {
      nombre: params.name,
      correo: params.email,
      password: params.password,
      idRol: params.roleId,
      idioma: params.lang,
      activo: params.isActive
    }
    return this.request(
      () => this.http.post<unknown>(`${this.origin}/api/usuarios`, body, { transferCache: false }),
      userDto
    )
  }
  updateUserStatusById(id: number, isActive: boolean) {
    return this.request(
      () =>
        this.http.patch<unknown>(
          `${this.origin}/api/usuarios/${id}/estado`,
          { activo: isActive },
          { transferCache: false }
        ),
      value => userForId(value, id)
    )
  }
  deleteUserById(id: number) {
    return this.request(
      () =>
        this.http.delete(`${this.origin}/api/usuarios/${id}`, {
          transferCache: false,
          responseType: "text"
        }),
      () => undefined
    )
  }
  updateUserById(id: number, params: UpdateUserParams): Observable<Result<User, UserError>> {
    const input = { ...params }
    const body = {
      nombre: input.name,
      correo: input.email,
      idRol: input.roleId,
      idioma: input.lang
    }
    return this.request(
      () =>
        this.http.put<unknown>(`${this.origin}/api/usuarios/${id}`, body, { transferCache: false }),
      value => userForId(value, id)
    ).pipe(
      switchMap(result => {
        if (!result.success) return of(result)
        const status =
          result.data.isActive === input.isActive
            ? of(result)
            : this.updateUserStatusById(id, input.isActive)
        return status.pipe(
          switchMap(updated => {
            if (!updated.success) return of(Result.failure(new UserError("PARTIAL_UPDATE")))
            if (input.password === undefined || input.password === "") return of(updated)
            return this.request(
              () =>
                this.http.put(
                  `${this.origin}/api/usuarios/${id}/password`,
                  { passwordNueva: input.password },
                  { transferCache: false, responseType: "text" }
                ),
              () => undefined
            ).pipe(
              map(reset =>
                reset.success ? updated : Result.failure(new UserError("PARTIAL_UPDATE"))
              )
            )
          })
        )
      })
    )
  }
}
