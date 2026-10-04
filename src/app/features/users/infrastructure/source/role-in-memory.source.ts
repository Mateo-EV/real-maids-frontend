import { inject, Injectable } from "@angular/core"
import { catchError, defaultIfEmpty, defer, map, Observable, of, take } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Role } from "../../domain/entities/role.entity"
import { RoleError } from "../../domain/errors/role.error"
import { CreateRoleParams } from "../../domain/params/create-role.params"
import { UpdateRoleParams } from "../../domain/params/update-role.params"
import { RoleRepository } from "../../domain/repositories/role.repository"
import { USER_REPOSITORY } from "../../domain/repositories/user.repository"

const copyFields = (input: CreateRoleParams): CreateRoleParams => ({
  name: input.name, description: input.description, isActive: input.isActive
})
const cloneRole = (role: Role): Role => Role.create(
  role.id, role.name, role.description, role.isActive, new Date(role.createdAt.getTime())
)

@Injectable({ providedIn: "root" })
export class RoleInMemorySource implements RoleRepository {
  private readonly users = inject(USER_REPOSITORY)
  private roles: Role[] = []
  private nextRoleId = 1

  createRole(params: CreateRoleParams): Observable<Result<Role, RoleError>> {
    const input = copyFields(params)
    return defer(() => {
      const role = Role.create(this.nextRoleId++, input.name, input.description, input.isActive, new Date())
      this.roles = [...this.roles, role]
      return of(Result.success(cloneRole(role)))
    })
  }

  getRoles(): Observable<Result<Role[], RoleError>> {
    return defer(() => of(Result.success(this.roles.map(cloneRole))))
  }

  getRoleById(id: number): Observable<Result<Role, RoleError>> {
    return defer(() => {
      const role = this.roles.find(item => item.id === id)
      return of(role ? Result.success(cloneRole(role)) : Result.failure(new RoleError("ROLE_NOT_FOUND")))
    })
  }

  updateRoleById(id: number, params: UpdateRoleParams): Observable<Result<Role, RoleError>> {
    const input = copyFields(params)
    return defer(() => {
      const existing = this.roles.find(role => role.id === id)
      if (!existing) return of(Result.failure(new RoleError("ROLE_NOT_FOUND")))
      const role = Role.create(id, input.name, input.description, input.isActive, new Date(existing.createdAt.getTime()))
      this.roles = this.roles.map(item => item.id === id ? role : item)
      return of(Result.success(cloneRole(role)))
    })
  }

  deleteRoleById(id: number): Observable<Result<void, RoleError>> {
    return defer(() => {
      if (!this.roles.some(role => role.id === id)) {
        return of(Result.failure(new RoleError("ROLE_NOT_FOUND")))
      }
      // Repository-level integrity, including inactive users; no reverse dependency/DI cycle.
      return defer(() => this.users.getUsers()).pipe(
        take(1),
        map((result): Result<void, RoleError> => {
          if (!result.success) return Result.failure(new RoleError("UNEXPECTED"))
          if (result.data.some(user => user.roleId === id)) return Result.failure(new RoleError("ROLE_IN_USE"))
          if (!this.roles.some(role => role.id === id)) return Result.failure(new RoleError("ROLE_NOT_FOUND"))
          this.roles = this.roles.filter(role => role.id !== id)
          return Result.success<void>(undefined)
        }),
        defaultIfEmpty(Result.failure(new RoleError("UNEXPECTED"))),
        catchError(() => of(Result.failure(new RoleError("UNEXPECTED"))))
      )
    })
  }
}
