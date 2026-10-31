import { TestBed } from "@angular/core/testing"
import { EMPTY, of, Subject, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { Role } from "../../domain/entities/role.entity"
import { RoleError } from "../../domain/errors/role.error"
import { CreateRoleUseCase } from "../../application/use-cases/create-role.use-case"
import { GetRolesUseCase } from "../../application/use-cases/get-roles.use-case"
import { UpdateRoleByIdUseCase } from "../../application/use-cases/update-role-by-id.use-case"
import { DeleteRoleByIdUseCase } from "../../application/use-cases/delete-role-by-id.use-case"
import { RolesStore } from "./roles.store"
import { PLATFORM_ID, signal } from "@angular/core"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"

it("RolesStore dispatches no reads during SSR", () => {
  const list = { execute: vi.fn() }
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: "server" },
      { provide: GetRolesUseCase, useValue: list },
      { provide: CreateRoleUseCase, useValue: {} },
      { provide: UpdateRoleByIdUseCase, useValue: {} },
      { provide: DeleteRoleByIdUseCase, useValue: {} }
    ]
  })
  const store = TestBed.inject(RolesStore)
  store.loadRoles().subscribe()
  expect(list.execute).not.toHaveBeenCalled()
  expect(store.loaded()).toBe(false)
})
const params = { name: "Demo", description: "Fictitious", isActive: true }
const role = Role.create(1, params.name, params.description, true, new Date())
describe("RolesStore", () => {
  let store: InstanceType<typeof RolesStore>
  const auth = { session: signal<AuthSession | null>(null) }
  let changes: Subject<AuthSession | null>
  const list = { execute: vi.fn() },
    create = { execute: vi.fn() },
    update = { execute: vi.fn() },
    remove = { execute: vi.fn() }
  beforeEach(() => {
    vi.resetAllMocks()
    auth.session.set(AuthSession.create("Tester", "tester@example.test"))
    changes = new Subject<AuthSession | null>()
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: auth },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
        { provide: GetRolesUseCase, useValue: list },
        { provide: CreateRoleUseCase, useValue: create },
        { provide: UpdateRoleByIdUseCase, useValue: update },
        { provide: DeleteRoleByIdUseCase, useValue: remove }
      ]
    })
    store = TestBed.inject(RolesStore)
  })
  it("reuses a successful catalog until the exact two-minute boundary without polling", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    try {
      list.execute.mockReturnValue(of(Result.success([])))
      store.loadRoles().subscribe()
      now.mockReturnValue(120999)
      store.loadRoles().subscribe()
      expect(list.execute).toHaveBeenCalledTimes(1)
      now.mockReturnValue(121000)
      expect(list.execute).toHaveBeenCalledTimes(1)
      store.loadRoles().subscribe()
      expect(list.execute).toHaveBeenCalledTimes(2)
    } finally {
      now.mockRestore()
    }
  })
  it("clears and fences reads and writes on logout without clearing for same-session renewal", () => {
    list.execute.mockReturnValue(of(Result.success([role])))
    store.loadRoles().subscribe()
    changes.next(AuthSession.create("Tester", "tester@example.test"))
    store.loadRoles().subscribe()
    expect(list.execute).toHaveBeenCalledTimes(1)
    const pending = new Subject<Result<Role, RoleError>>()
    create.execute.mockReturnValue(pending)
    store.createRole(params).subscribe()
    auth.session.set(null)
    changes.next(null)
    expect(pending.observed).toBe(false)
    pending.next(Result.success(role))
    expect(store.roles()).toEqual([])
    expect(store.loaded()).toBe(false)
    expect(store.loading()).toBe(false)
    store.loadRoles().subscribe()
    expect(list.execute).toHaveBeenCalledTimes(1)
  })
  it("shares reads, keeps stale roles on failure and does not extend TTL on cache hits or errors", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    try {
      list.execute.mockReturnValue(of(Result.success([role])))
      store.loadRoles().subscribe()
      now.mockReturnValue(121000)
      const response = new Subject<Result<Role[], RoleError>>()
      list.execute.mockReturnValue(response)
      const first = store.loadRoles().subscribe()
      const second = store.loadRoles().subscribe()
      expect(list.execute).toHaveBeenCalledTimes(2)
      expect(store.refreshing()).toBe(true)
      expect(store.roles()).toEqual([role])
      first.unsubscribe()
      expect(response.observed).toBe(true)
      response.next(Result.failure(new RoleError("UNEXPECTED")))
      response.complete()
      expect(store.expires()).toBe(121000)
      expect(store.loaded()).toBe(true)
      store.loadRoles().subscribe().unsubscribe()
      expect(list.execute).toHaveBeenCalledTimes(3)
      second.unsubscribe()
      expect(store.refreshing()).toBe(false)
    } finally {
      now.mockRestore()
    }
  })
  it("fences reads started while a role mutation was pending", () => {
    const write = new Subject<Result<Role, RoleError>>()
    const read = new Subject<Result<Role[], RoleError>>()
    create.execute.mockReturnValue(write)
    list.execute.mockReturnValue(read)
    store.createRole(params).subscribe()
    store.loadRoles().subscribe()
    write.next(Result.success(role))
    write.complete()
    read.next(Result.success([]))
    read.complete()
    expect(store.roles()).toEqual([role])
    expect(store.expires()).toBe(0)
  })
  it("invalidates successful fixture mutations without extending catalog freshness", () => {
    list.execute.mockReturnValue(of(Result.success([role])))
    store.loadRoles().subscribe()
    create.execute.mockReturnValue(of(Result.success(role)))
    store.createRole(params).subscribe()
    expect(store.expires()).toBe(0)
    store.loadRoles().subscribe()
    expect(list.execute).toHaveBeenCalledTimes(2)
  })
  it("defers requests and resets loading on completion, cancellation and empty completion", () => {
    const response = new Subject<Result<Role[], RoleError>>()
    list.execute.mockReturnValue(response)
    const request = store.loadRoles()
    expect(store.loading()).toBe(false)
    expect(list.execute).not.toHaveBeenCalled()
    const subscription = request.subscribe()
    expect(store.loading()).toBe(true)
    subscription.unsubscribe()
    expect(store.loading()).toBe(false)
    list.execute.mockReturnValue(EMPTY)
    store.loadRoles().subscribe()
    expect(store.loading()).toBe(false)
    list.execute.mockReturnValue(of(Result.success([])))
    store.loadRoles().subscribe()
    expect(store.roles()).toEqual([])
    expect(store.loaded()).toBe(true)
  })
  it("applies CRUD and records failures without altering records", () => {
    create.execute.mockReturnValue(of(Result.success(role)))
    store.createRole(params).subscribe()
    expect(store.roles()).toEqual([role])
    const changed = Role.create(1, "Changed", "Fictitious", false, role.createdAt)
    update.execute.mockReturnValue(of(Result.success(changed)))
    store.updateRoleById(1, { ...params, isActive: false }).subscribe()
    expect(store.roles()).toEqual([changed])
    const error = new RoleError("ROLE_IN_USE")
    remove.execute.mockReturnValue(of(Result.failure(error)))
    store.deleteRoleById(1).subscribe()
    expect(store.error()).toBe(error)
    expect(store.roles()).toEqual([changed])
    remove.execute.mockReturnValue(of(Result.success(undefined)))
    store.deleteRoleById(1).subscribe()
    expect(store.roles()).toEqual([])
    expect(store.error()).toBeUndefined()
  })
  it("normalizes thrown errors and keeps existing data on load failure", () => {
    list.execute.mockReturnValue(of(Result.success([role])))
    store.loadRoles().subscribe()
    list.execute.mockReturnValue(throwError(() => new Error("offline")))
    store.loadRoles(true).subscribe()
    expect(store.error()).toMatchObject({ code: "UNEXPECTED" })
    expect(store.roles()).toEqual([role])
    create.execute.mockImplementation(() => {
      throw new Error("sync")
    })
    store.createRole(params).subscribe()
    expect(store.loading()).toBe(false)
    expect(store.error()).toMatchObject({ code: "UNEXPECTED" })
  })
  it("keeps records on create/update/list domain failures and does not mark failed loads as loaded", () => {
    const error = new RoleError("UNEXPECTED")
    list.execute.mockReturnValue(of(Result.failure(error)))
    store.loadRoles().subscribe()
    expect(store.loaded()).toBe(false)
    expect(store.error()).toBe(error)
    create.execute.mockReturnValue(of(Result.success(role)))
    store.createRole(params).subscribe()
    create.execute.mockReturnValue(of(Result.failure(error)))
    store.createRole(params).subscribe()
    expect(store.roles()).toEqual([role])
    expect(store.error()).toBe(error)
    update.execute.mockReturnValue(of(Result.failure(new RoleError("ROLE_NOT_FOUND"))))
    store.updateRoleById(1, params).subscribe()
    expect(store.roles()).toEqual([role])
    expect(store.error()).toMatchObject({ code: "ROLE_NOT_FOUND" })
  })
  it("does not let stale list failures overwrite current mutation feedback", () => {
    const stale = new Subject<Result<Role[], RoleError>>()
    list.execute.mockReturnValue(stale)
    store.loadRoles().subscribe()
    create.execute.mockReturnValue(of(Result.success(role)))
    store.createRole(params).subscribe()
    stale.next(Result.failure(new RoleError("UNEXPECTED")))
    stale.complete()
    expect(store.error()).toBeUndefined()
    expect(store.roles()).toEqual([role])
    expect(store.loading()).toBe(false)
  })
  it("keeps aggregate loading until obsolete reads and writes all settle", () => {
    list.execute.mockReturnValue(of(Result.success([role])))
    store.loadRoles().subscribe()
    const older = new Subject<Result<Role[], RoleError>>()
    const newer = new Subject<Result<Role[], RoleError>>()
    const write = new Subject<Result<Role, RoleError>>()
    list.execute.mockReturnValueOnce(older).mockReturnValueOnce(newer)
    create.execute.mockReturnValue(write)
    const received = vi.fn()
    store.loadRoles(true).subscribe(received)
    store.loadRoles(true).subscribe()
    expect(store.refreshing()).toBe(true)
    newer.next(Result.success([role]))
    newer.complete()
    expect(store.refreshing()).toBe(false)
    expect(store.loading()).toBe(true)
    store.createRole(params).subscribe()
    older.next(Result.failure(new RoleError("NETWORK")))
    older.complete()
    expect(received).toHaveBeenCalledWith(Result.failure(new RoleError("NETWORK")))
    expect(store.error()).toBeUndefined()
    expect(store.loading()).toBe(true)
    write.complete()
    expect(store.loading()).toBe(false)
  })
  it("retains dispatch invalidation on failed writes and starts an independent read", () => {
    const older = new Subject<Result<Role[], RoleError>>()
    list.execute.mockReturnValueOnce(older).mockReturnValueOnce(of(Result.success([role])))
    const received = vi.fn()
    store.loadRoles().subscribe(received)
    create.execute.mockReturnValue(of(Result.failure(new RoleError("UNSUPPORTED"))))
    store.createRole(params).subscribe()
    expect(store.expires()).toBe(0)
    expect(store.error()).toMatchObject({ code: "UNSUPPORTED" })
    store.loadRoles().subscribe()
    expect(list.execute).toHaveBeenCalledTimes(2)
    older.next(Result.success([]))
    older.complete()
    expect(received).toHaveBeenCalledWith(Result.success([]))
    expect(store.roles()).toEqual([role])
    expect(store.error()).toBeUndefined()
    expect(store.loading()).toBe(false)
  })
  it("cancels overlapping session-old reads without disturbing a replacement session read", () => {
    const older = new Subject<Result<Role[], RoleError>>()
    const forced = new Subject<Result<Role[], RoleError>>()
    const fresh = new Subject<Result<Role[], RoleError>>()
    list.execute.mockReturnValueOnce(older).mockReturnValueOnce(forced).mockReturnValueOnce(fresh)
    store.loadRoles().subscribe()
    store.loadRoles(true).subscribe()
    const replacement = AuthSession.create("Other", "other@example.test")
    auth.session.set(replacement)
    changes.next(replacement)
    expect(older.observed).toBe(false)
    expect(forced.observed).toBe(false)
    expect(store.loading()).toBe(false)
    expect(store.loaded()).toBe(false)
    store.loadRoles().subscribe()
    older.next(Result.success([role]))
    expect(store.loading()).toBe(true)
    expect(store.roles()).toEqual([])
    fresh.next(Result.success([role]))
    fresh.complete()
    expect(store.roles()).toEqual([role])
    expect(store.loading()).toBe(false)
  })
  it("ignores stale loads after mutations and older overlapping loads", () => {
    const stale = new Subject<Result<Role[], RoleError>>()
    list.execute.mockReturnValue(stale)
    store.loadRoles().subscribe()
    const mutation = new Subject<Result<Role, RoleError>>()
    create.execute.mockReturnValue(mutation)
    store.createRole(params).subscribe()
    mutation.next(Result.success(role))
    mutation.complete()
    expect(store.loading()).toBe(true)
    stale.next(Result.success([]))
    stale.complete()
    expect(store.roles()).toEqual([role])
    expect(store.loading()).toBe(false)
    const older = new Subject<Result<Role[], RoleError>>()
    list.execute.mockReturnValue(older)
    store.loadRoles().subscribe()
    list.execute.mockReturnValue(of(Result.success([role])))
    store.loadRoles(true).subscribe()
    older.next(Result.success([]))
    older.complete()
    expect(store.roles()).toEqual([role])
  })
})
