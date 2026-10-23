import { TestBed } from "@angular/core/testing"
import { EMPTY, firstValueFrom, of, Subject, throwError } from "rxjs"
import { signal, PLATFORM_ID } from "@angular/core"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { GetUsersPageUseCase } from "../../application/use-cases/get-users-page.use-case"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { Lang, User } from "../../domain/entities/user.entity"
import { UserError } from "../../domain/errors/user.error"
import { CreateUserUseCase } from "../../application/use-cases/create-user.use-case"
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
const page: PaginationResponse<User> = { items: [user], offset: 0, limit: 10, total: 1 }
const identity = () => AuthSession.create("Fake", params.email, null, null, 1)

describe("UserStore writes and shared query cache", () => {
  let store: InstanceType<typeof UserStore>
  const create = { execute: vi.fn() },
    update = { execute: vi.fn() },
    status = { execute: vi.fn() },
    remove = { execute: vi.fn() },
    read = { execute: vi.fn() }
  let session = signal<AuthSession | null>(identity())
  let changes = new Subject<AuthSession | null>()
  beforeEach(() => {
    vi.resetAllMocks()
    session = signal<AuthSession | null>(identity())
    changes = new Subject<AuthSession | null>()
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { session } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
        { provide: GetUsersPageUseCase, useValue: read },
        { provide: CreateUserUseCase, useValue: create },
        { provide: UpdateUserByIdUseCase, useValue: update },
        { provide: UpdateUserStatusByIdUseCase, useValue: status },
        { provide: DeleteUserByIdUseCase, useValue: remove }
      ]
    })
    store = TestBed.inject(UserStore)
    read.execute.mockReturnValue(of(Result.success(page)))
  })
  afterEach(() => vi.useRealTimers())
  it("has no implied complete catalog or global query", () => {
    for (const field of ["users", "loaded", "loadUsers", "total", "query"])
      expect(store).not.toHaveProperty(field)
    expect(store.mutationRevision()).toBe(0)
    expect(store.loading()).toBe(false)
  })
  it("returns confirmed writes and notifies once without replay", async () => {
    const result = Result.success(user)
    create.execute.mockReturnValue(of(result))
    update.execute.mockReturnValue(of(result))
    status.execute.mockReturnValue(of(result))
    const deleted = Result.success<void>(undefined)
    remove.execute.mockReturnValue(of(deleted))
    expect(await firstValueFrom(store.createUser(params))).toBe(result)
    expect(await firstValueFrom(store.updateUserById(1, params))).toBe(result)
    expect(await firstValueFrom(store.updateUserStatusById(1, false))).toBe(result)
    expect(await firstValueFrom(store.deleteUserById(1))).toBe(deleted)
    expect(store.mutationRevision()).toBe(4)
    expect(create.execute).toHaveBeenCalledExactlyOnceWith(params)
    expect(update.execute).toHaveBeenCalledExactlyOnceWith(1, params)
    expect(status.execute).toHaveBeenCalledExactlyOnceWith(1, false)
    expect(remove.execute).toHaveBeenCalledExactlyOnceWith(1)
  })
  it("preserves partial-update errors and notifies exactly once", async () => {
    const error = new UserError("PARTIAL_UPDATE"),
      result = Result.failure(error)
    update.execute.mockReturnValue(of(result))
    expect(await firstValueFrom(store.updateUserById(1, params))).toBe(result)
    expect(store.error()).toBe(error)
    expect(store.mutationRevision()).toBe(1)
    expect(update.execute).toHaveBeenCalledOnce()
  })
  it("normalizes thrown and empty failures without notifying success", async () => {
    const error = new UserError("USER_NOT_FOUND")
    for (const response of [
      of(Result.failure(error)),
      throwError(() => error),
      throwError(() => new Error("offline")),
      EMPTY
    ]) {
      status.execute.mockReturnValue(response)
      const result = await firstValueFrom(store.updateUserStatusById(1, false))
      expect(result.success).toBe(false)
      if (!result.success) expect(store.error()).toBe(result.error)
      expect(store.loading()).toBe(false)
    }
    expect(store.mutationRevision()).toBe(0)
    status.execute.mockImplementation(() => {
      throw error
    })
    await firstValueFrom(store.updateUserStatusById(1, false))
    expect(store.error()).toBe(error)
  })
  it("tracks concurrent pending writes and finalizes cancellation without notification", () => {
    const pending = new Subject<Result<User, UserError>>()
    status.execute.mockReturnValue(pending)
    const first = store.updateUserStatusById(1, false).subscribe()
    const second = store.updateUserStatusById(2, false).subscribe()
    expect(store.loading()).toBe(true)
    first.unsubscribe()
    expect(store.loading()).toBe(true)
    second.unsubscribe()
    expect(pending.observed).toBe(false)
    expect(store.loading()).toBe(false)
    expect(store.mutationRevision()).toBe(0)
  })
  it("normalizes complete query keys without merging search, page, role or false status", () => {
    store.readPage({ search: " Fake ", offset: 0, limit: 20 }).subscribe()
    store.readPage({ search: "Fake" }).subscribe()
    expect(read.execute).toHaveBeenCalledOnce()
    for (const query of [
      { search: "fake" },
      { search: "Fake", offset: 20 },
      { search: "Fake", limit: 10 },
      { search: "Fake", roleId: 0 },
      { search: "Fake", isActive: false }
    ])
      store.readPage(query).subscribe()
    expect(read.execute).toHaveBeenCalledTimes(6)
  })
  it("expires at exactly two minutes on read, without polling, and bounds cache entries", () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    store.readPage({}).subscribe()
    vi.advanceTimersByTime(119999)
    store.readPage({}).subscribe()
    expect(read.execute).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1)
    expect(read.execute).toHaveBeenCalledOnce()
    store.readPage({}).subscribe()
    expect(read.execute).toHaveBeenCalledTimes(2)
    for (let roleId = 0; roleId < 21; roleId++) store.readPage({ roleId }).subscribe()
    store.readPage({}).subscribe()
    expect(read.execute).toHaveBeenCalledTimes(24)
  })
  it("shares same-key flights until the last reader cancels and restarts cancelled requests", () => {
    const pending = new Subject<Result<PaginationResponse<User>, UserError>>()
    read.execute.mockReturnValue(pending)
    const first = store.readPage({}).subscribe(),
      second = store.readPage({}).subscribe()
    expect(read.execute).toHaveBeenCalledOnce()
    first.unsubscribe()
    expect(pending.observed).toBe(true)
    second.unsubscribe()
    expect(pending.observed).toBe(false)
    store.readPage({}).subscribe().unsubscribe()
    expect(read.execute).toHaveBeenCalledTimes(2)
  })
  it.each(["success", "partial"])("invalidates all variants on %s and fences late reads", kind => {
    store.readPage({ roleId: 1 }).subscribe()
    const late = new Subject<Result<PaginationResponse<User>, UserError>>()
    read.execute.mockReturnValueOnce(late)
    const received = vi.fn()
    store.readPage({ roleId: 2 }).subscribe(received)
    update.execute.mockReturnValue(
      of(
        kind === "success" ? Result.success(user) : Result.failure(new UserError("PARTIAL_UPDATE"))
      )
    )
    store.updateUserById(1, params).subscribe()
    expect(late.observed).toBe(false)
    late.next(Result.success(page))
    expect(received).not.toHaveBeenCalled()
    store.readPage({ roleId: 1 }).subscribe()
    store.readPage({ roleId: 2 }).subscribe()
    expect(read.execute).toHaveBeenCalledTimes(4)
    expect(store.mutationRevision()).toBe(1)
  })
  it("clears on logout/replacement but not same-session credential renewal", () => {
    store.readPage({}).subscribe()
    changes.next(identity())
    store.readPage({}).subscribe()
    expect(read.execute).toHaveBeenCalledOnce()
    session.set(null)
    changes.next(null)
    store.readPage({}).subscribe()
    expect(read.execute).toHaveBeenCalledOnce()
    session.set(identity())
    changes.next(session())
    store.readPage({}).subscribe()
    expect(read.execute).toHaveBeenCalledTimes(2)
    const late = new Subject<Result<PaginationResponse<User>, UserError>>()
    read.execute.mockReturnValueOnce(late)
    store.readPage({ roleId: 2 }).subscribe()
    session.set(AuthSession.create("Other", "other@example.test", null, null, 2))
    changes.next(session())
    expect(late.observed).toBe(false)
    store.readPage({}).subscribe()
    expect(read.execute).toHaveBeenCalledTimes(4)
  })
  it("notifies for each concurrent write, but fences a write completed after session replacement", () => {
    store.readPage({}).subscribe()
    const first = new Subject<Result<User, UserError>>()
    const second = new Subject<Result<User, UserError>>()
    status.execute.mockReturnValueOnce(first).mockReturnValueOnce(second)
    store.updateUserStatusById(1, false).subscribe()
    store.updateUserStatusById(2, false).subscribe()
    first.next(Result.success(user))
    second.next(Result.success(user))
    expect(store.mutationRevision()).toBe(2)
    const oldWrite = new Subject<Result<User, UserError>>()
    status.execute.mockReturnValueOnce(oldWrite)
    store.updateUserStatusById(1, true).subscribe()
    session.set(null)
    changes.next(null)
    session.set(identity())
    changes.next(session())
    store.readPage({}).subscribe()
    oldWrite.next(Result.failure(new UserError("PARTIAL_UPDATE")))
    expect(store.mutationRevision()).toBe(2)
    expect(store.error()).toBeUndefined()
    store.readPage({}).subscribe()
    expect(read.execute).toHaveBeenCalledTimes(2)
  })
  it("checks fixed session expiry before a cache hit, and never caches failed reads", () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    session.set(AuthSession.create("Test", params.email, null, 2000, 1))
    read.execute.mockReturnValueOnce(of(Result.failure(new UserError("NETWORK"))))
    store.readPage({}).subscribe()
    store.readPage({}).subscribe()
    expect(read.execute).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1000)
    const received = vi.fn()
    store.readPage({}).subscribe(received)
    expect(received).not.toHaveBeenCalled()
    expect(read.execute).toHaveBeenCalledTimes(2)
  })
  it("dispatches no user reads on the server", () => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: "server" },
        { provide: GetUsersPageUseCase, useValue: read }
      ]
    })
    TestBed.inject(UserStore).readPage({}).subscribe()
    expect(read.execute).not.toHaveBeenCalled()
  })
})
