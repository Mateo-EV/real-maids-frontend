import { inject, Injectable } from "@angular/core"
import {
  catchError,
  defaultIfEmpty,
  defer,
  map,
  Observable,
  of,
  switchMap,
  take,
  timer
} from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Role } from "../../domain/entities/role.entity"
import { RoleError } from "../../domain/errors/role.error"
import { CreateRoleParams } from "../../domain/params/create-role.params"
import { UpdateRoleParams } from "../../domain/params/update-role.params"
import { UserInMemorySource } from "./user-in-memory.source"

const copyFields = (input: CreateRoleParams): CreateRoleParams => ({
  name: input.name,
  description: input.description,
  isActive: input.isActive
})
const cloneRole = (role: Role): Role =>
  Role.create(
    role.id,
    role.name,
    role.description,
    role.isActive,
    new Date(role.createdAt.getTime())
  )

@Injectable({ providedIn: "root" })
export class RoleInMemorySource {
  private readonly users = inject(UserInMemorySource)
  // FICTITIOUS DEMO DATA — stable catalog IDs match source-owned users, not permissions.
  private roles: Role[] = [
    Role.create(
      1,
      "Administración",
      "Administración general del sistema.",
      true,
      new Date("2026-09-01T00:00:00Z")
    ),
    Role.create(
      2,
      "Operaciones",
      "Coordinación de operaciones y servicios.",
      true,
      new Date("2026-09-01T00:00:00Z")
    ),
    Role.create(
      3,
      "Personal Campo",
      "Personal de campo y ejecución de servicios.",
      true,
      new Date("2026-09-01T00:00:00Z")
    ),
    Role.create(
      4,
      "Cliente (Portal)",
      "Clientes del portal de servicios.",
      true,
      new Date("2026-09-01T00:00:00Z")
    ),
    Role.create(
      5,
      "Supervisión",
      "Supervisión y seguimiento de operaciones.",
      true,
      new Date("2026-09-01T00:00:00Z")
    )
  ]
  private nextRoleId = Math.max(...this.roles.map(role => role.id)) + 1

  createRole(params: CreateRoleParams): Observable<Result<Role, RoleError>> {
    const input = copyFields(params)
    return timer(250).pipe(
      switchMap(() => {
        const role = Role.create(
          this.nextRoleId++,
          input.name,
          input.description,
          input.isActive,
          new Date()
        )
        this.roles = [...this.roles, role]
        return of(Result.success(cloneRole(role)))
      })
    )
  }

  getRoles(): Observable<Result<Role[], RoleError>> {
    return timer(250).pipe(switchMap(() => of(Result.success(this.roles.map(cloneRole)))))
  }

  getRoleById(id: number): Observable<Result<Role, RoleError>> {
    return timer(250).pipe(
      switchMap(() => {
        const role = this.roles.find(item => item.id === id)
        return of(
          role ? Result.success(cloneRole(role)) : Result.failure(new RoleError("ROLE_NOT_FOUND"))
        )
      })
    )
  }

  updateRoleById(id: number, params: UpdateRoleParams): Observable<Result<Role, RoleError>> {
    const input = copyFields(params)
    return timer(250).pipe(
      switchMap(() => {
        const existing = this.roles.find(role => role.id === id)
        if (!existing) return of(Result.failure(new RoleError("ROLE_NOT_FOUND")))
        const role = Role.create(
          id,
          input.name,
          input.description,
          input.isActive,
          new Date(existing.createdAt.getTime())
        )
        this.roles = this.roles.map(item => (item.id === id ? role : item))
        return of(Result.success(cloneRole(role)))
      })
    )
  }

  deleteRoleById(id: number): Observable<Result<void, RoleError>> {
    return timer(250).pipe(
      switchMap(() => {
        if (!this.roles.some(role => role.id === id)) {
          return of(Result.failure(new RoleError("ROLE_NOT_FOUND")))
        }
        // Unwired fixture integrity, including inactive users; never consult the HTTP repository.
        return defer(() => this.users.getUsers()).pipe(
          take(1),
          map((result): Result<void, RoleError> => {
            if (!result.success) return Result.failure(new RoleError("UNEXPECTED"))
            if (result.data.some(user => user.roleId === id))
              return Result.failure(new RoleError("ROLE_IN_USE"))
            if (!this.roles.some(role => role.id === id))
              return Result.failure(new RoleError("ROLE_NOT_FOUND"))
            this.roles = this.roles.filter(role => role.id !== id)
            return Result.success<void>(undefined)
          }),
          defaultIfEmpty(Result.failure(new RoleError("UNEXPECTED"))),
          catchError(() => of(Result.failure(new RoleError("UNEXPECTED"))))
        )
      })
    )
  }
}
