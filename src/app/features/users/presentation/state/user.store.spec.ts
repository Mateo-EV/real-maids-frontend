import { TestBed } from "@angular/core/testing"
import { EMPTY, of, Subject, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { Lang, User } from "../../domain/entities/user.entity"
import { UserError } from "../../domain/errors/user.error"
import { CreateUserUseCase } from "../../application/use-cases/create-user.use-case"
import { GetUsersUseCase } from "../../application/use-cases/get-users.use-case"
import { UpdateUserByIdUseCase } from "../../application/use-cases/update-user-by-id.use-case"
import { DeleteUserByIdUseCase } from "../../application/use-cases/delete-user-by-id.use-case"
import { UserStore } from "./user.store"

const params = {
  name: "Demo",
  age: 30,
  email: "demo@example.com",
  password: "unused",
  lang: Lang.EN,
  isActive: true,
  roleId: 1
}
const user = User.create(1, params.name, 30, params.email, Lang.EN, true, new Date(), new Date(), 1)
describe("UserStore", () => {
  let store: InstanceType<typeof UserStore>
  const list = { execute: vi.fn() },
    create = { execute: vi.fn() },
    update = { execute: vi.fn() },
    remove = { execute: vi.fn() }
  beforeEach(() => {
    vi.resetAllMocks()
    TestBed.configureTestingModule({
      providers: [
        { provide: GetUsersUseCase, useValue: list },
        { provide: CreateUserUseCase, useValue: create },
        { provide: UpdateUserByIdUseCase, useValue: update },
        { provide: DeleteUserByIdUseCase, useValue: remove }
      ]
    })
    store = TestBed.inject(UserStore)
  })
  it("retains the load flow and clears loading on cancellation and empty completion", () => {
    const response = new Subject<Result<User[], UserError>>()
    list.execute.mockReturnValue(response)
    const subscription = store.loadUsers().subscribe()
    expect(store.loading()).toBe(true)
    response.next(Result.success([user]))
    response.complete()
    expect(store.users()).toEqual([user])
    expect(store.loading()).toBe(false)
    subscription.unsubscribe()
    list.execute.mockReturnValue(new Subject())
    const pending = store.loadUsers().subscribe()
    pending.unsubscribe()
    expect(store.loading()).toBe(false)
    list.execute.mockReturnValue(EMPTY)
    store.loadUsers().subscribe()
    expect(store.loading()).toBe(false)
  })
  it("applies successful mutations and reports failure without replacing users", () => {
    create.execute.mockReturnValue(of(Result.success(user)))
    store.createUser(params).subscribe()
    expect(store.users()).toEqual([user])
    const changed = User.create(
      1,
      "Changed",
      30,
      params.email,
      Lang.EN,
      false,
      user.createdAt,
      new Date(),
      2
    )
    update.execute.mockReturnValue(of(Result.success(changed)))
    store.updateUserById(1, { ...params, roleId: 2 }).subscribe()
    expect(store.users()).toEqual([changed])
    const error = new UserError("USER_NOT_FOUND")
    remove.execute.mockReturnValue(of(Result.failure(error)))
    store.deleteUserById(1).subscribe()
    expect(store.error()).toBe(error)
    expect(store.users()).toEqual([changed])
    remove.execute.mockReturnValue(of(Result.success(undefined)))
    store.deleteUserById(1).subscribe()
    expect(store.users()).toEqual([])
    expect(store.error()).toBeUndefined()
  })
  it("normalizes observable and synchronous errors", () => {
    list.execute.mockReturnValue(throwError(() => new Error("offline")))
    store.loadUsers().subscribe()
    expect(store.error()).toMatchObject({ code: "UNEXPECTED" })
    expect(store.loading()).toBe(false)
    create.execute.mockImplementation(() => {
      throw new Error("sync")
    })
    store.createUser(params).subscribe()
    expect(store.error()).toMatchObject({ code: "UNEXPECTED" })
    expect(store.loading()).toBe(false)
  })
  it("preserves users on domain failures and ignores superseded list responses", () => {
    list.execute.mockReturnValue(of(Result.success([user])))
    store.loadUsers().subscribe()
    const error = new UserError("UNEXPECTED")
    list.execute.mockReturnValue(of(Result.failure(error)))
    store.loadUsers().subscribe()
    expect(store.error()).toBe(error)
    create.execute.mockReturnValue(of(Result.failure(error)))
    store.createUser(params).subscribe()
    update.execute.mockReturnValue(of(Result.failure(error)))
    store.updateUserById(1, params).subscribe()
    expect(store.users()).toEqual([user])
    const older = new Subject<Result<User[], UserError>>()
    list.execute.mockReturnValue(older)
    store.loadUsers().subscribe()
    list.execute.mockReturnValue(of(Result.success([user])))
    store.loadUsers().subscribe()
    older.next(Result.failure(error))
    older.next(Result.success([]))
    older.complete()
    expect(store.users()).toEqual([user])
    expect(store.error()).toBeUndefined()
    expect(store.loading()).toBe(false)
  })
  it("does not let an older load erase a successful mutation", () => {
    const stale = new Subject<Result<User[], UserError>>()
    list.execute.mockReturnValue(stale)
    store.loadUsers().subscribe()
    create.execute.mockReturnValue(of(Result.success(user)))
    store.createUser(params).subscribe()
    expect(store.loading()).toBe(true)
    stale.next(Result.success([]))
    stale.complete()
    expect(store.users()).toEqual([user])
    expect(store.loading()).toBe(false)
  })
})
