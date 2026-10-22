import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable, of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { Lang, User } from "../../domain/entities/user.entity"
import { UserError } from "../../domain/errors/user.error"
import { CreateUserParams } from "../../domain/params/create-user.params"
import { UpdateUserParams } from "../../domain/params/update-user.params"
import { USER_REPOSITORY, UserRepository } from "../../domain/repositories/user.repository"
import { CreateUserUseCase } from "./create-user.use-case"
import { GetUserByIdUseCase } from "./get-user-by-id.use-case"
import { GetUserStatisticsUseCase } from "./get-user-statistics.use-case"
import { GetUsersPageUseCase } from "./get-users-page.use-case"
import { UpdateUserStatusByIdUseCase } from "./update-user-status-by-id.use-case"
import { UpdateUserByIdUseCase } from "./update-user-by-id.use-case"
import { DeleteUserByIdUseCase } from "./delete-user-by-id.use-case"

const input: CreateUserParams = {
  name: "Demo user",
  email: "demo@example.com",
  password: "demo-only",
  lang: Lang.EN,
  isActive: true,
  roleId: 1
}
const update: UpdateUserParams = { ...input, name: "Updated user" }
const user = User.create(
  7,
  input.name,
  input.email,
  input.lang,
  input.isActive,
  new Date("2026-01-01T00:00:00Z"),
  new Date("2026-01-01T00:00:00Z"),
  input.roleId
)

describe("Users use cases", () => {
  let repository: UserRepository

  beforeEach(() => {
    repository = {
      createUser: vi.fn(),
      getUserById: vi.fn(),
      getUserStatistics: vi.fn(),
      getUsersPage: vi.fn(),
      updateUserById: vi.fn(),
      updateUserStatusById: vi.fn(),
      deleteUserById: vi.fn()
    }
    TestBed.configureTestingModule({
      providers: [{ provide: USER_REPOSITORY, useValue: repository }]
    })
  })

  function check<T>(
    method: keyof UserRepository,
    result: Result<T, UserError>,
    execute: () => Observable<Result<T, UserError>>,
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
    const error = new UserError("UNEXPECTED")

    it(`delegates create and preserves ${outcome}`, () =>
      check(
        "createUser",
        success ? Result.success(user) : Result.failure(error),
        () => TestBed.inject(CreateUserUseCase).execute(input),
        [input]
      ))

    it(`delegates read and preserves ${outcome}`, () =>
      check(
        "getUserById",
        success ? Result.success(user) : Result.failure(error),
        () => TestBed.inject(GetUserByIdUseCase).execute(7),
        [7]
      ))

    it(`delegates global statistics and preserves ${outcome}`, () =>
      check(
        "getUserStatistics",
        success ? Result.success({ total: 3, active: 2, inactive: 1 }) : Result.failure(error),
        () => TestBed.inject(GetUserStatisticsUseCase).execute(),
        []
      ))

    it(`delegates server listing and preserves ${outcome}`, () => {
      const query = { offset: 0, limit: 10, roleId: 0, isActive: false }
      return check(
        "getUsersPage",
        success
          ? Result.success({ items: [user], offset: 0, limit: 10, total: 1 })
          : Result.failure(error),
        () => TestBed.inject(GetUsersPageUseCase).execute(query),
        [query]
      )
    })

    it(`delegates update and preserves ${outcome}`, () =>
      check(
        "updateUserById",
        success ? Result.success(user) : Result.failure(error),
        () => TestBed.inject(UpdateUserByIdUseCase).execute(7, update),
        [7, update]
      ))

    for (const desired of [true, false]) {
      it(`delegates status=${desired} and preserves ${outcome}`, () =>
        check(
          "updateUserStatusById",
          success ? Result.success(user) : Result.failure(error),
          () => TestBed.inject(UpdateUserStatusByIdUseCase).execute(7, desired),
          [7, desired]
        ))
    }

    it(`delegates delete and preserves ${outcome}`, () =>
      check(
        "deleteUserById",
        success ? Result.success<void>(undefined) : Result.failure(error),
        () => TestBed.inject(DeleteUserByIdUseCase).execute(7),
        [7]
      ))
  }
})
