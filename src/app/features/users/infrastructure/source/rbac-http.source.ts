import { isPlatformBrowser } from "@angular/common"
import { HttpClient, HttpErrorResponse } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { Result } from "@/app/shared/utils/result"
import { Permission, PermissionAssignment } from "../../domain/entities/permission.entity"
import { RbacError, RbacErrorCode } from "../../domain/errors/rbac.error"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { dtoId, dtoRecord, dtoText } from "@/app/shared/infrastructure/http/dto-validation"

function invalid(): never {
  throw new RbacError("INVALID_RESPONSE")
}
function rbacTransportCode(error: unknown): RbacErrorCode {
  if (error instanceof RbacError) return error.code
  if (error instanceof AuthError) {
    switch (error.code) {
      case "FORBIDDEN":
      case "NETWORK":
      case "UNCONFIGURED":
        return error.code
      case "INVALID_CREDENTIALS":
      case "COORDINATION":
      case "CANCELLED":
        return "UNAUTHENTICATED"
    }
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
        return "ROLE_NOT_FOUND"
    }
  }
  return "UNEXPECTED"
}
function permissionsDto(value: unknown): Permission[] {
  if (!Array.isArray(value)) throw new RbacError("INVALID_RESPONSE")
  const items = value.map(item => {
    const p = dtoRecord(item, invalid)
    if (
      !dtoId(p["idPermiso"]) ||
      p["idPermiso"] < 0 ||
      !dtoText(p["codigo"]) ||
      !dtoText(p["modulo"]) ||
      typeof p["descripcion"] !== "string"
    )
      throw new RbacError("INVALID_RESPONSE")
    return {
      id: p["idPermiso"],
      code: p["codigo"],
      module: p["modulo"],
      description: p["descripcion"]
    }
  })
  if (
    new Set(items.map(p => p.id)).size !== items.length ||
    new Set(items.map(p => p.code)).size !== items.length
  )
    throw new RbacError("INVALID_RESPONSE")
  return items
}
@Injectable({ providedIn: "root" })
export class RbacHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private request<T>(
    send: () => Observable<unknown>,
    parse: (value: unknown) => T
  ): Observable<Result<T, RbacError>> {
    return defer(() => {
      if (!this.browser || !this.origin) return of(Result.failure(new RbacError("UNCONFIGURED")))
      return defer(send).pipe(
        map(value => Result.success(parse(value))),
        catchError(error => of(Result.failure(new RbacError(rbacTransportCode(error)))))
      )
    })
  }
  getPermissions() {
    return this.request(
      () => this.http.get<unknown>(`${this.origin}/api/permisos`, { transferCache: false }),
      permissionsDto
    )
  }
  getRolePermissions(roleId: number) {
    return this.request(
      () => {
        if (!dtoId(roleId)) throw new RbacError("INVALID_GRANTS")
        return this.http.get<unknown>(`${this.origin}/api/roles/${roleId}/permisos`, {
          transferCache: false
        })
      },
      value => ({ roleId, permissions: permissionsDto(value) })
    )
  }
  saveRolePermissions(
    roleId: number,
    ids: readonly number[]
  ): Observable<Result<PermissionAssignment, RbacError>> {
    const input = Array.isArray(ids) ? [...ids] : null
    return this.request(
      () => {
        if (
          !dtoId(roleId) ||
          !input ||
          input.some(id => !dtoId(id) || id < 0) ||
          new Set(input).size !== input.length
        )
          throw new RbacError("INVALID_GRANTS")
        return this.http.put<unknown>(
          `${this.origin}/api/roles/${roleId}/permisos`,
          { idsPermisos: input },
          { transferCache: false }
        )
      },
      value => {
        const role = dtoRecord(value, invalid)
        if (role["idRol"] !== roleId) throw new RbacError("INVALID_RESPONSE")
        const permissions = permissionsDto(role["permisos"])
        if (
          !input ||
          permissions.length !== input.length ||
          permissions.some(p => !input.includes(p.id))
        )
          throw new RbacError("INVALID_RESPONSE")
        return { roleId, permissions }
      }
    )
  }
}
