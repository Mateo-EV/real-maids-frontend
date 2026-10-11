import { isPlatformBrowser } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { Result } from "@/app/shared/utils/result"
import { Permission, PermissionAssignment } from "../../domain/entities/permission.entity"
import { RbacError, RbacErrorCode } from "../../domain/errors/rbac.error"
import { dtoId, dtoRecord, dtoText, userTransportCode } from "./user-http.source"
function permissionsDto(value: unknown): Permission[] {
  if (!Array.isArray(value)) throw new RbacError("INVALID_RESPONSE")
  const items = value.map(item => {
    const p = dtoRecord(item)
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
        catchError(error => {
          const code = userTransportCode(error)
          const mapped: RbacErrorCode =
            error instanceof RbacError
              ? error.code
              : code === "USER_NOT_FOUND"
                ? "ROLE_NOT_FOUND"
                : code === "INVALID_RESPONSE" ||
                    code === "FORBIDDEN" ||
                    code === "UNAUTHENTICATED" ||
                    code === "NETWORK" ||
                    code === "UNCONFIGURED" ||
                    code === "VALIDATION"
                  ? code
                  : "UNEXPECTED"
          return of(Result.failure(new RbacError(mapped)))
        })
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
        const role = dtoRecord(value)
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
