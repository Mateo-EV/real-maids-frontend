import { TestBed } from "@angular/core/testing"
import { EMPTY, of, Subject, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { Lang, User } from "../../domain/entities/user.entity"
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
describe("UserStore collection", () => {
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
    list.execute.mockReturnValue(of(Result.success([user])))
  })
  it("stores arrays without exposing transport metadata or sending query arguments", () => {
    store.loadUsers().subscribe()
    expect(list.execute).toHaveBeenCalledExactlyOnceWith()
    expect(store.users()).toEqual([user])
    for (const field of ["page", "size", "total", "totalPages", "query"])
      expect(store).not.toHaveProperty(field)
    expect(store.loaded()).toBe(true)
    expect(store.loading()).toBe(false)
  })
  it("reloads after status success and cancels a pre-write read", () => {
    store.loadUsers().subscribe()
    const stale = new Subject<Result<User[], UserError>>()
    list.execute.mockReturnValue(stale)
    store.loadUsers().subscribe()
    const response = new Subject<Result<User, UserError>>()
    status.execute.mockReturnValue(response)
    store.updateUserStatusById(1, false).subscribe()
    const refreshed = new Subject<Result<User[], UserError>>()
    list.execute.mockReturnValue(refreshed)
    response.next(Result.success(user))
    response.complete()
    expect(stale.observed).toBe(false)
    stale.next(Result.success([user]))
    refreshed.next(Result.success([]))
    refreshed.complete()
    expect(store.users()).toEqual([])
    expect(store.error()).toBeUndefined()
    expect(store.loading()).toBe(false)
    expect(status.execute).toHaveBeenCalledExactlyOnceWith(1, false)
  })
  it("preserves rows on mutation failures, normalizes exceptions and finalizes cancellation", () => {
    store.loadUsers().subscribe()
    const error = new UserError("USER_NOT_FOUND")
    status.execute.mockReturnValue(of(Result.failure(error)))
    store.updateUserStatusById(1, false).subscribe()
    expect(store.error()).toBe(error)
    expect(store.users()).toEqual([user])
    status.execute.mockReturnValue(throwError(() => new Error("offline")))
    store.updateUserStatusById(1, false).subscribe()
    expect(store.error()?.code).toBe("UNEXPECTED")
    status.execute.mockImplementation(() => {
      throw error
    })
    store.updateUserStatusById(1, false).subscribe()
    expect(store.error()).toBe(error)
    const pending = new Subject<Result<User, UserError>>()
    status.execute.mockReturnValue(pending)
    const subscription = store.updateUserStatusById(1, false).subscribe()
    subscription.unsubscribe()
    expect(pending.observed).toBe(false)
    expect(store.loading()).toBe(false)
    expect(store.users()).toEqual([user])
    status.execute.mockReturnValue(EMPTY)
    store.updateUserStatusById(1, false).subscribe()
    expect(store.loading()).toBe(false)
  })
  it("cancels older reads and ignores their success/failure after a newer read", () => {
    const older = new Subject<Result<User[], UserError>>()
    list.execute.mockReturnValue(older)
    store.loadUsers().subscribe()
    list.execute.mockReturnValue(of(Result.success([user])))
    store.loadUsers().subscribe()
    expect(older.observed).toBe(false)
    older.next(Result.failure(new UserError("UNEXPECTED")))
    older.next(Result.success([]))
    expect(store.users()).toEqual([user])
    expect(store.error()).toBeUndefined()
  })
  it("reloads after every confirmed write and partial update without replay", () => {
    store.loadUsers().subscribe()
    create.execute.mockReturnValue(of(Result.success(user)))
    update.execute.mockReturnValue(of(Result.success(user)))
    status.execute.mockReturnValue(of(Result.success(user)))
    remove.execute.mockReturnValue(of(Result.success(undefined)))
    store.createUser(params).subscribe()
    store.updateUserById(1, params).subscribe()
    store.updateUserStatusById(1, false).subscribe()
    store.deleteUserById(1).subscribe()
    update.execute.mockReturnValue(of(Result.failure(new UserError("PARTIAL_UPDATE"))))
    const next = vi.fn()
    store.updateUserById(1, params).subscribe(next)
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "PARTIAL_UPDATE" })
      })
    )
    expect(list.execute).toHaveBeenCalledTimes(6)
    expect(store.mutationRevision()).toBe(5)
    expect(list.execute.mock.calls.every(args => args.length === 0)).toBe(true)
    expect(create.execute).toHaveBeenCalledTimes(1)
    expect(update.execute).toHaveBeenCalledTimes(2)
    expect(status.execute).toHaveBeenCalledTimes(1)
    expect(remove.execute).toHaveBeenCalledTimes(1)
    expect(store.users()).toEqual([user])
  })
  it("refreshes changed profiles and deletion rather than guessing collection membership", () => {
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
    list.execute.mockReturnValue(of(Result.success([changed])))
    update.execute.mockReturnValue(of(Result.success(changed)))
    store.updateUserById(1, { ...params, roleId: 2 }).subscribe()
    expect(store.users()).toEqual([changed])
    remove.execute.mockReturnValue(of(Result.failure(new UserError("USER_NOT_FOUND"))))
    store.deleteUserById(1).subscribe()
    expect(store.users()).toEqual([changed])
    list.execute.mockReturnValue(of(Result.success([])))
    remove.execute.mockReturnValue(of(Result.success(undefined)))
    store.deleteUserById(1).subscribe()
    expect(store.users()).toEqual([])
  })
  it("retains follow-up read errors while reporting confirmed mutation success", () => {
    store.loadUsers().subscribe()
    create.execute.mockReturnValue(of(Result.success(user)))
    list.execute.mockReturnValue(of(Result.failure(new UserError("NETWORK"))))
    const next = vi.fn()
    store.createUser(params).subscribe(next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: user }))
    expect(store.error()?.code).toBe("NETWORK")
    expect(store.mutationRevision()).toBe(1)
    expect(store.users()).toEqual([user])
  })
  it("performs just one read even for an empty collection", () => {
    list.execute.mockReturnValue(of(Result.success([])))
    store.loadUsers().subscribe()
    expect(list.execute).toHaveBeenCalledExactlyOnceWith()
    expect(store.users()).toEqual([])
    expect(store.loaded()).toBe(true)
  })
  it("normalizes read exceptions and never reports empty/cancelled reads as successful", () => {
    list.execute.mockReturnValue(throwError(() => new Error("offline")))
    store.loadUsers().subscribe()
    expect(store.error()?.code).toBe("UNEXPECTED")
    const response = new Subject<Result<User[], UserError>>()
    list.execute.mockReturnValue(response)
    store.loadUsers().subscribe().unsubscribe()
    expect(response.observed).toBe(false)
    expect(store.loading()).toBe(false)
    expect(store.loaded()).toBe(false)
    const next = vi.fn()
    list.execute.mockReturnValue(EMPTY)
    store.loadUsers().subscribe(next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
    expect(store.loaded()).toBe(false)
  })
})
