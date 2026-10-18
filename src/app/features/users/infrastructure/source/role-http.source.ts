import { isPlatformBrowser } from "@angular/common"
import { HttpClient, HttpErrorResponse } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { Result } from "@/app/shared/utils/result"
import { Role } from "../../domain/entities/role.entity"
import { RoleError, RoleErrorCode } from "../../domain/errors/role.error"
import { CreateRoleParams } from "../../domain/params/create-role.params"
import { UpdateRoleParams } from "../../domain/params/update-role.params"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { dtoDate, dtoId, dtoRecord, dtoText } from "@/app/shared/infrastructure/http/dto-validation"

function invalid(): never {
  throw new RoleError("INVALID_RESPONSE")
}
function roleTransportCode(error: unknown): RoleErrorCode {
  if (error instanceof RoleError) return error.code
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

function roleDto(value: unknown): Role {
  const role = dtoRecord(value, invalid)
  if (
    !dtoId(role["idRol"]) ||
    !dtoText(role["nombre"]) ||
    typeof role["descripcion"] !== "string" ||
    typeof role["activo"] !== "boolean"
  )
    throw new RoleError("INVALID_RESPONSE")
  // Permissions/system-role rules belong to T4, not inferred catalog authorization.
  return Role.create(
    role["idRol"],
    role["nombre"],
    role["descripcion"],
    role["activo"],
    dtoDate(role["fechaCreacion"], invalid)
  )
}
@Injectable({ providedIn: "root" })
export class RoleHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))

  private query<T>(path: string, parse: (value: unknown) => T) {
    return defer(() => {
      if (!this.browser || !this.origin) return of(Result.failure(new RoleError("UNCONFIGURED")))
      return this.http.get<unknown>(`${this.origin}${path}`, { transferCache: false }).pipe(
        map(value => Result.success(parse(value))),
        catchError(error => of(Result.failure(new RoleError(roleTransportCode(error)))))
      )
    })
  }
  getRoles() {
    return this.query("/api/roles", value => {
      if (!Array.isArray(value)) throw new RoleError("INVALID_RESPONSE")
      const roles = value.map(roleDto)
      if (new Set(roles.map(role => role.id)).size !== roles.length)
        throw new RoleError("INVALID_RESPONSE")
      return roles
    })
  }
  getRoleById(id: number) {
    return this.query(`/api/roles/${id}`, value => {
      const role = roleDto(value)
      if (role.id !== id) throw new RoleError("INVALID_RESPONSE")
      return role
    })
  }

  // Retained application contracts have no management UI. Never fall back to demo mutation
  // or invent a role DELETE endpoint; enable documented management as its own approved unit.
  createRole(_params: CreateRoleParams) {
    return of(Result.failure(new RoleError("UNSUPPORTED")))
  }
  updateRoleById(_id: number, _params: UpdateRoleParams) {
    return of(Result.failure(new RoleError("UNSUPPORTED")))
  }
  deleteRoleById(_id: number) {
    return of(Result.failure(new RoleError("UNSUPPORTED")))
  }
}
