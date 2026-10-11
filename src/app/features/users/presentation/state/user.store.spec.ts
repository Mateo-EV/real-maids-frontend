import { TestBed } from "@angular/core/testing"
import { EMPTY, of, Subject, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { Lang, User } from "../../domain/entities/user.entity"
import { UserPage } from "../../domain/models/user-page"
import { UserError } from "../../domain/errors/user.error"
import { CreateUserUseCase } from "../../application/use-cases/create-user.use-case"
import { GetUsersUseCase } from "../../application/use-cases/get-users.use-case"
import { UpdateUserStatusByIdUseCase } from "../../application/use-cases/update-user-status-by-id.use-case"
import { UpdateUserByIdUseCase } from "../../application/use-cases/update-user-by-id.use-case"
import { DeleteUserByIdUseCase } from "../../application/use-cases/delete-user-by-id.use-case"
import { UserStore } from "./user.store"

const params = {
  name: "Fake",
  email: "fake@example.test",
  password: "FakePassword1",
  lang: Lang.EN,
  isActive: true,
  roleId: 1
}
const user = User.create(1, params.name, params.email, Lang.EN, true, new Date(), new Date(), 1)
const page = (items: User[], total = items.length): UserPage => ({
  items,
  page: 0,
  size: 5,
  total,
  totalPages: Math.ceil(total / 5)
})
describe("UserStore server catalog", () => {
  let store: InstanceType<typeof UserStore>
  const list = { execute: vi.fn() },
    create = { execute: vi.fn() },
    update = { execute: vi.fn() },
    status = { execute: vi.fn() },
    remove = { execute: vi.fn() }
  beforeEach(() => {
    vi.resetAllMocks()
    TestBed.configureTestingModule({
      providers: [
        { provide: GetUsersUseCase, useValue: list },
        { provide: CreateUserUseCase, useValue: create },
        { provide: UpdateUserByIdUseCase, useValue: update },
        { provide: UpdateUserStatusByIdUseCase, useValue: status },
        { provide: DeleteUserByIdUseCase, useValue: remove }
      ]
    })
    store = TestBed.inject(UserStore)
  })
  it("stores server totals independently from the current page and forwards filters", () => {
    list.execute.mockReturnValue(of(Result.success(page([user], 47))))
    const query = { page: 0, size: 5, search: "Fake", roleId: 1, isActive: true }
    store.loadUsers(query).subscribe()
    expect(list.execute).toHaveBeenCalledExactlyOnceWith(query)
    expect(store.users()).toEqual([user])
    expect(store.total()).toBe(47)
    expect(store.totalPages()).toBe(10)
    expect(store.loading()).toBe(false)
  })
  it("requeries the same server filter after status success and cancels stale list writes", () => {
    list.execute.mockReturnValue(of(Result.success(page([user], 20))))
    store.loadUsers({ page: 0, size: 5, isActive: true }).subscribe()
    const stale = new Subject<Result<UserPage, UserError>>()
    list.execute.mockReturnValue(stale)
    store.loadUsers({ page: 0, size: 5, isActive: true }).subscribe()
    const response = new Subject<Result<User, UserError>>()
    status.execute.mockReturnValue(response)
    const subscription = store.updateUserStatusById(1, false).subscribe()
    expect(store.loading()).toBe(true)
    const refreshed = new Subject<Result<UserPage, UserError>>()
    list.execute.mockReturnValue(refreshed)
    response.next(Result.success(user))
    response.complete()
    expect(stale.observed).toBe(false)
    expect(list.execute).toHaveBeenLastCalledWith({ page: 0, size: 5, isActive: true })
    stale.next(Result.success(page([user], 99)))
    refreshed.next(Result.success(page([], 0)))
    refreshed.complete()
    expect(store.users()).toEqual([])
    expect(store.total()).toBe(0)
    expect(store.error()).toBeUndefined()
    expect(store.loading()).toBe(false)
    expect(status.execute).toHaveBeenCalledExactlyOnceWith(1, false)
    subscription.unsubscribe()
  })
  it("preserves rows on mutation errors, normalizes thrown errors and finalizes cancellation", () => {
    list.execute.mockReturnValue(of(Result.success(page([user]))))
    store.loadUsers().subscribe()
    const error = new UserError("USER_NOT_FOUND")
    status.execute.mockReturnValue(of(Result.failure(error)))
    store.updateUserStatusById(1, false).subscribe()
    expect(store.error()).toBe(error)
    expect(store.users()).toEqual([user])
    status.execute.mockReturnValue(throwError(() => new Error("offline")))
    store.updateUserStatusById(1, false).subscribe()
    expect(store.error()).toMatchObject({ code: "UNEXPECTED" })
    status.execute.mockImplementation(() => {
      throw error
    })
    store.updateUserStatusById(1, false).subscribe()
    expect(store.error()).toBe(error)
    const pending = new Subject<Result<User, UserError>>()
    status.execute.mockReturnValue(pending)
    const subscription = store.updateUserStatusById(1, false).subscribe()
    expect(store.error()).toBeUndefined()
    subscription.unsubscribe()
    expect(pending.observed).toBe(false)
    expect(store.loading()).toBe(false)
    expect(store.users()).toEqual([user])
    status.execute.mockReturnValue(EMPTY)
    store.updateUserStatusById(1, false).subscribe()
    expect(store.loading()).toBe(false)
  })
  it("cancels older queries and ignores their success and failure after a newer page", () => {
    const older = new Subject<Result<UserPage, UserError>>()
    list.execute.mockReturnValue(older)
    store.loadUsers().subscribe()
    list.execute.mockReturnValue(of(Result.success(page([user]))))
    store.loadUsers({ page: 0, size: 5 }).subscribe()
    expect(older.observed).toBe(false)
    older.next(Result.failure(new UserError("UNEXPECTED")))
    older.next(Result.success(page([])))
    expect(store.users()).toEqual([user])
    expect(store.error()).toBeUndefined()
    expect(store.loading()).toBe(false)
  })
  it("reloads after create/update/delete instead of guessing sorting or totals", () => {
    list.execute.mockReturnValue(of(Result.success(page([user]))))
    create.execute.mockReturnValue(of(Result.success(user)))
    store.createUser(params).subscribe()
    expect(store.users()).toEqual([user])
    const changed = User.create(
      1,
      "Changed",
      params.email,
      Lang.EN,
      false,
      user.createdAt,
      new Date(),
      2
    )
    list.execute.mockReturnValue(of(Result.success(page([changed]))))
    update.execute.mockReturnValue(of(Result.success(changed)))
    store.updateUserById(1, { ...params, roleId: 2 }).subscribe()
    expect(store.users()).toEqual([changed])
    remove.execute.mockReturnValue(of(Result.failure(new UserError("USER_NOT_FOUND"))))
    store.deleteUserById(1).subscribe()
    expect(store.users()).toEqual([changed])
    list.execute.mockReturnValue(of(Result.success(page([]))))
    remove.execute.mockReturnValue(of(Result.success(undefined)))
    store.deleteUserById(1).subscribe()
    expect(store.users()).toEqual([])
    expect(store.total()).toBe(0)
    expect(store.error()).toBeUndefined()
  })
  it("remembers the large catalog query for every confirmed write and partial update", () => {
    const query = { page: 0, size: 10000 }
    list.execute.mockReturnValue(
      of(Result.success({ ...page([user]), size: 10000, totalPages: 1 }))
    )
    store.loadUsers(query).subscribe()
    create.execute.mockReturnValue(of(Result.success(user)))
    update.execute.mockReturnValue(of(Result.success(user)))
    status.execute.mockReturnValue(of(Result.success(user)))
    remove.execute.mockReturnValue(of(Result.success(undefined)))
    store.createUser(params).subscribe()
    store.updateUserById(1, params).subscribe()
    store.updateUserStatusById(1, false).subscribe()
    store.deleteUserById(1).subscribe()
    update.execute.mockReturnValue(of(Result.failure(new UserError("PARTIAL_UPDATE"))))
    store.updateUserById(1, params).subscribe()
    expect(list.execute).toHaveBeenCalledTimes(6)
    expect(
      list.execute.mock.calls.every(([input]) => JSON.stringify(input) === JSON.stringify(query))
    ).toBe(true)
    expect(create.execute).toHaveBeenCalledTimes(1)
    expect(update.execute).toHaveBeenCalledTimes(2)
    expect(status.execute).toHaveBeenCalledTimes(1)
    expect(remove.execute).toHaveBeenCalledTimes(1)
  })

  it("reports successful mutation even when the follow-up read fails, retaining the read error", () => {
    create.execute.mockReturnValue(of(Result.success(user)))
    list.execute.mockReturnValue(of(Result.failure(new UserError("NETWORK"))))
    const next = vi.fn()
    store.createUser(params).subscribe(next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: user }))
    expect(store.error()?.code).toBe("NETWORK")
    expect(store.users()).toEqual([])
  })
  it("refreshes confirmed profile changes when a later update step fails", () => {
    update.execute.mockReturnValue(of(Result.failure(new UserError("PARTIAL_UPDATE"))))
    list.execute.mockReturnValue(of(Result.success(page([user]))))
    const next = vi.fn()
    store.updateUserById(1, params).subscribe(next)
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "PARTIAL_UPDATE" })
      })
    )
    expect(store.users()).toEqual([user])
  })
  it("requeries a bounded valid server page when deletion leaves a requested page out of range", () => {
    list.execute
      .mockReturnValueOnce(of(Result.success({ ...page([], 45), page: 9 })))
      .mockReturnValueOnce(of(Result.success({ ...page([user], 45), page: 8 })))
    store.loadUsers({ page: 9, size: 5, roleId: 1 }).subscribe()
    expect(list.execute).toHaveBeenCalledTimes(2)
    expect(list.execute).toHaveBeenLastCalledWith({ page: 8, size: 5, roleId: 1 })
    expect(store.page()).toBe(8)
    expect(store.total()).toBe(45)
    expect(store.users()).toEqual([user])
  })
  it("normalizes list exceptions and cleans up empty/cancelled reads", () => {
    list.execute.mockReturnValue(throwError(() => new Error("offline")))
    store.loadUsers().subscribe()
    expect(store.error()).toMatchObject({ code: "UNEXPECTED" })
    const response = new Subject<Result<UserPage, UserError>>()
    list.execute.mockReturnValue(response)
    const subscription = store.loadUsers().subscribe()
    subscription.unsubscribe()
    expect(response.observed).toBe(false)
    expect(store.loading()).toBe(false)
    list.execute.mockReturnValue(EMPTY)
    store.loadUsers().subscribe()
    expect(store.loading()).toBe(false)
  })
})
