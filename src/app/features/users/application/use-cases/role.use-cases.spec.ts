import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable, of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { Role } from "../../domain/entities/role.entity"
import { RoleError } from "../../domain/errors/role.error"
import { ROLE_REPOSITORY, RoleRepository } from "../../domain/repositories/role.repository"
import { CreateRoleUseCase } from "./create-role.use-case"
import { GetRoleByIdUseCase } from "./get-role-by-id.use-case"
import { GetRolesUseCase } from "./get-roles.use-case"
import { UpdateRoleByIdUseCase } from "./update-role-by-id.use-case"
import { DeleteRoleByIdUseCase } from "./delete-role-by-id.use-case"

const input = { name: "Demo", description: "Fictitious", isActive: true }
const role = Role.create(7, input.name, input.description, input.isActive, new Date())
describe("Role use cases", () => {
  let repository: RoleRepository
  beforeEach(() => {
    repository = {
      createRole: vi.fn(),
      getRoleById: vi.fn(),
      getRoles: vi.fn(),
      updateRoleById: vi.fn(),
      deleteRoleById: vi.fn()
    }
    TestBed.configureTestingModule({
      providers: [{ provide: ROLE_REPOSITORY, useValue: repository }]
    })
  })
  function check<T>(
    method: keyof RoleRepository,
    result: Result<T, RoleError>,
    execute: () => Observable<Result<T, RoleError>>,
    args: unknown[]
  ) {
    const stream = of(result)
    Object.assign(repository, { [method]: vi.fn(() => stream) })
    const returned = execute()
    expect(returned).toBe(stream)
    expect(repository[method]).toHaveBeenCalledExactlyOnceWith(...args)
    return firstValueFrom(returned).then(actual => expect(actual).toBe(result))
  }
  for (const success of [true, false]) {
    const outcome = success ? "success" : "failure"
    const error = new RoleError("UNEXPECTED")
    it(`delegates create and preserves ${outcome}`, () =>
      check(
        "createRole",
        success ? Result.success(role) : Result.failure(error),
        () => TestBed.inject(CreateRoleUseCase).execute(input),
        [input]
      ))
    it(`delegates read and preserves ${outcome}`, () =>
      check(
        "getRoleById",
        success ? Result.success(role) : Result.failure(error),
        () => TestBed.inject(GetRoleByIdUseCase).execute(7),
        [7]
      ))
    it(`delegates list and preserves ${outcome}`, () =>
      check(
        "getRoles",
        success ? Result.success([role]) : Result.failure(error),
        () => TestBed.inject(GetRolesUseCase).execute(),
        []
      ))
    it(`delegates update and preserves ${outcome}`, () =>
      check(
        "updateRoleById",
        success ? Result.success(role) : Result.failure(error),
        () => TestBed.inject(UpdateRoleByIdUseCase).execute(7, input),
        [7, input]
      ))
    it(`delegates delete and preserves ${outcome}`, () =>
      check(
        "deleteRoleById",
        success ? Result.success<void>(undefined) : Result.failure(error),
        () => TestBed.inject(DeleteRoleByIdUseCase).execute(7),
        [7]
      ))
  }
})
