import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, Subject } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { RBAC_REPOSITORY } from "../../domain/repositories/rbac.repository"
import { PermissionAssignment } from "../../domain/entities/permission.entity"
import { RbacError } from "../../domain/errors/rbac.error"
import { RbacStore } from "./rbac.store"
import { PLATFORM_ID, signal } from "@angular/core"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { beforeEach } from "vitest"
beforeEach(() =>
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthStore,
        useValue: { session: signal(AuthSession.create("Tester", "tester@example.test")) }
      },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => new Subject() } }
    ]
  })
)
describe("RbacStore", () => {
  it("does not read or reinsert roles from completion callbacks during session reset", () => {
    const session = signal<AuthSession | null>(AuthSession.create("Tester", "tester@example.test"))
    const changes = new Subject<AuthSession | null>()
    const pending = new Subject<Result<PermissionAssignment, RbacError>>()
    const getRolePermissions = vi.fn(() => pending)
    TestBed.overrideProvider(AuthStore, { useValue: { session } })
    TestBed.overrideProvider(ObserveAuthSessionUseCase, { useValue: { execute: () => changes } })
    TestBed.configureTestingModule({
      providers: [{ provide: RBAC_REPOSITORY, useValue: { getRolePermissions } }]
    })
    const store = TestBed.inject(RbacStore)
    store.loadPermissions(19).subscribe({ complete: () => store.loadPermissions(19).subscribe() })
    const replacement = AuthSession.create("Other", "other@example.test")
    session.set(replacement)
    changes.next(replacement)
    expect(getRolePermissions).toHaveBeenCalledTimes(1)
    expect(store.assignmentEntries()).toEqual({})
    expect(store.matrices()).toEqual({})
    expect(store.sessionRevision()).toBe(1)
    store.loadPermissions(19).subscribe().unsubscribe()
    expect(getRolePermissions).toHaveBeenCalledTimes(2)
    session.set(null)
    changes.next(null)
    expect(store.sessionRevision()).toBe(2)
  })
  it("expires catalog and assignments after thirty seconds without extending freshness on cache access", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    try {
      const getPermissions = vi.fn(() => of(Result.success([])))
      const getRolePermissions = vi.fn((roleId: number) =>
        of(Result.success({ roleId, permissions: [] }))
      )
      TestBed.configureTestingModule({
        providers: [{ provide: RBAC_REPOSITORY, useValue: { getPermissions, getRolePermissions } }]
      })
      const store = TestBed.inject(RbacStore)
      store.loadCatalog().subscribe()
      store.loadPermissions(19).subscribe()
      expect(store.catalogEntry().expires).toBe(31000)
      expect(store.assignmentEntries()[19].expires).toBe(31000)
      now.mockReturnValue(30999)
      store.loadCatalog().subscribe()
      store.loadPermissions(19).subscribe()
      expect(getPermissions).toHaveBeenCalledTimes(1)
      expect(getRolePermissions).toHaveBeenCalledTimes(1)
      now.mockReturnValue(31000)
      store.loadCatalog().subscribe()
      store.loadPermissions(19).subscribe()
      expect(getPermissions).toHaveBeenCalledTimes(2)
      expect(getRolePermissions).toHaveBeenCalledTimes(2)
    } finally {
      now.mockRestore()
    }
  })
  it("caches defensive catalog copies and invalidates assignments at write start", () => {
    const permission = { id: 73, code: "CUSTOM", module: "Custom", description: "Description" }
    const initial = { roleId: 19, permissions: [permission] }
    const delayed = new Subject<Result<PermissionAssignment, RbacError>>()
    const received = vi.fn()
    const repository = {
      getPermissions: vi.fn(() => of(Result.success([permission]))),
      getRolePermissions: vi
        .fn()
        .mockReturnValueOnce(of(Result.success(initial)))
        .mockReturnValueOnce(delayed)
        .mockReturnValue(of(Result.success(initial))),
      saveRolePermissions: vi.fn(() => of(Result.success({ roleId: 19, permissions: [] })))
    }
    TestBed.configureTestingModule({
      providers: [{ provide: RBAC_REPOSITORY, useValue: repository }]
    })
    const store = TestBed.inject(RbacStore)
    store.loadCatalog().subscribe()
    store.loadCatalog().subscribe()
    expect(repository.getPermissions).toHaveBeenCalledTimes(1)
    expect(store.catalog()[0]).not.toBe(permission)
    store.loadPermissions(19).subscribe()
    expect(store.matrices()[19]).not.toBe(initial)
    expect(store.matrices()[19].permissions[0]).not.toBe(permission)
    store.loadPermissions(19, true).subscribe(received)
    store.savePermissionIds(19, []).subscribe()
    expect(store.assignmentEntries()[19].expires).toBe(0)
    delayed.next(Result.success(initial))
    delayed.complete()
    expect(received).toHaveBeenCalledWith(Result.failure(new RbacError("BUSY")))
    expect(store.matrices()[19].permissions).toEqual([])
    store.loadPermissions(19).subscribe()
    expect(repository.getRolePermissions).toHaveBeenCalledTimes(3)
  })
  it("rejects admission when every history entry is retained", async () => {
    const getRolePermissions = vi.fn((roleId: number) =>
      of(Result.success({ roleId, permissions: [] }))
    )
    TestBed.configureTestingModule({
      providers: [{ provide: RBAC_REPOSITORY, useValue: { getRolePermissions } }]
    })
    const store = TestBed.inject(RbacStore)
    const releases: (() => void)[] = []
    for (let id = 1; id <= 20; id++) {
      store.loadPermissions(id).subscribe()
      releases.push(store.retainRole(id))
    }
    expect(await firstValueFrom(store.loadPermissions(21))).toMatchObject({
      success: false,
      error: { code: "BUSY" }
    })
    expect(getRolePermissions).toHaveBeenCalledTimes(20)
    releases[0]()
    store.loadPermissions(21).subscribe()
    expect(getRolePermissions).toHaveBeenCalledTimes(21)
  })
  it("dispatches no catalog/assignment/write operations during SSR", () => {
    const getPermissions = vi.fn(),
      getRolePermissions = vi.fn(),
      saveRolePermissions = vi.fn()
    TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    TestBed.configureTestingModule({
      providers: [
        {
          provide: RBAC_REPOSITORY,
          useValue: { getPermissions, getRolePermissions, saveRolePermissions }
        }
      ]
    })
    const store = TestBed.inject(RbacStore)
    store.loadCatalog().subscribe()
    store.loadPermissions(19).subscribe()
    store.savePermissionIds(19, []).subscribe()
    expect(getPermissions).not.toHaveBeenCalled()
    expect(getRolePermissions).not.toHaveBeenCalled()
    expect(saveRolePermissions).not.toHaveBeenCalled()
  })
  it("delivers BUSY for an obsolete forced read and keeps aggregate loading until all reads end", () => {
    const older = new Subject<Result<PermissionAssignment, RbacError>>()
    const newer = new Subject<Result<PermissionAssignment, RbacError>>()
    const received = vi.fn()
    TestBed.configureTestingModule({
      providers: [
        {
          provide: RBAC_REPOSITORY,
          useValue: {
            getRolePermissions: vi.fn().mockReturnValueOnce(older).mockReturnValueOnce(newer)
          }
        }
      ]
    })
    const store = TestBed.inject(RbacStore)
    store.loadPermissions(19).subscribe(received)
    store.loadPermissions(19, true).subscribe()
    newer.next(Result.success({ roleId: 19, permissions: [] }))
    newer.complete()
    expect(store.loading()).toBe(true)
    older.next(Result.success({ roleId: 19, permissions: [] }))
    expect(received).toHaveBeenCalledWith(Result.failure(new RbacError("BUSY")))
    older.complete()
    expect(store.loading()).toBe(false)
  })
  it("pins retained roles, evicts inactive history and reads an evicted role again", () => {
    const getRolePermissions = vi.fn((roleId: number) =>
      of(Result.success({ roleId, permissions: [] }))
    )
    TestBed.configureTestingModule({
      providers: [{ provide: RBAC_REPOSITORY, useValue: { getRolePermissions } }]
    })
    const store = TestBed.inject(RbacStore)
    const release = store.retainRole(1)
    for (let id = 1; id <= 21; id++) store.loadPermissions(id).subscribe()
    expect(Object.keys(store.assignmentEntries())).toHaveLength(20)
    expect(store.matrices()[1]).toBeDefined()
    expect(store.matrices()[2]).toBeUndefined()
    release()
    store.loadPermissions(2).subscribe()
    expect(getRolePermissions).toHaveBeenCalledTimes(22)
    expect(store.matrices()[2]).toBeDefined()
    expect(Object.keys(store.assignmentEntries())).toHaveLength(20)
  })
  it("retains stale assignments on failed refresh without renewing TTL and shares cancellation", () => {
    const pending = new Subject<Result<PermissionAssignment, RbacError>>()
    const getRolePermissions = vi
      .fn()
      .mockReturnValueOnce(of(Result.success({ roleId: 19, permissions: [] })))
      .mockReturnValue(pending)
    TestBed.configureTestingModule({
      providers: [{ provide: RBAC_REPOSITORY, useValue: { getRolePermissions } }]
    })
    const store = TestBed.inject(RbacStore)
    store.loadPermissions(19).subscribe()
    const expires = store.assignmentEntries()[19].expires
    const a = store.loadPermissions(19, true).subscribe()
    const b = store.loadPermissions(19).subscribe()
    a.unsubscribe()
    expect(pending.observed).toBe(true)
    pending.next(Result.failure(new RbacError("FORBIDDEN")))
    pending.complete()
    expect(store.assignmentEntries()[19]).toMatchObject({
      result: { roleId: 19, permissions: [] },
      expires,
      error: { code: "FORBIDDEN" },
      refreshing: false
    })
    b.unsubscribe()
    const c = store.loadPermissions(19, true).subscribe()
    c.unsubscribe()
    expect(store.loading()).toBe(false)
  })
  it("preserves renewal and fences reads and writes on session replacement", () => {
    const session = signal<AuthSession | null>(AuthSession.create("Tester", "tester@example.test"))
    const changes = new Subject<AuthSession | null>()
    const read = new Subject<Result<PermissionAssignment, RbacError>>()
    const write = new Subject<Result<PermissionAssignment, RbacError>>()
    TestBed.overrideProvider(AuthStore, { useValue: { session } })
    TestBed.overrideProvider(ObserveAuthSessionUseCase, { useValue: { execute: () => changes } })
    TestBed.configureTestingModule({
      providers: [
        {
          provide: RBAC_REPOSITORY,
          useValue: { getRolePermissions: () => read, saveRolePermissions: () => write }
        }
      ]
    })
    const store = TestBed.inject(RbacStore)
    store.loadPermissions(19).subscribe()
    store.savePermissionIds(20, []).subscribe()
    const renewal = AuthSession.create("Renamed", "tester@example.test")
    session.set(renewal)
    changes.next(renewal)
    expect(store.sessionRevision()).toBe(0)
    expect(read.observed).toBe(true)
    expect(write.observed).toBe(true)
    session.set(null)
    changes.next(null)
    expect(store.sessionRevision()).toBe(1)
    expect(read.observed).toBe(false)
    expect(write.observed).toBe(false)
    read.next(Result.success({ roleId: 19, permissions: [] }))
    write.next(Result.success({ roleId: 20, permissions: [] }))
    expect(store.matrices()).toEqual({})
    expect(store.loading()).toBe(false)
  })
  it("keeps loaded data on query failure and ignores stale loads after save", async () => {
    const initial: PermissionAssignment = {
      roleId: 19,
      permissions: [{ id: 73, code: "CUSTOM", module: "Custom", description: "Description" }]
    }
    const delayed = new Subject<Result<PermissionAssignment, RbacError>>()
    const repository = {
      getRolePermissions: vi
        .fn()
        .mockReturnValueOnce(of(Result.success(initial)))
        .mockReturnValueOnce(delayed)
        .mockReturnValue(of(Result.failure(new RbacError("UNEXPECTED")))),
      saveRolePermissions: vi.fn((roleId: number) =>
        of(Result.success({ roleId, permissions: [] }))
      )
    }
    TestBed.configureTestingModule({
      providers: [{ provide: RBAC_REPOSITORY, useValue: repository }]
    })
    const store = TestBed.inject(RbacStore)
    await firstValueFrom(store.loadPermissions(19))
    const stale = store.loadPermissions(19, true).subscribe()
    await firstValueFrom(store.savePermissionIds(19, []))
    delayed.next(Result.success(initial))
    delayed.complete()
    stale.unsubscribe()
    expect(store.matrices()[19].permissions).toEqual([])
    await firstValueFrom(store.loadPermissions(19))
    expect(store.matrices()[19].permissions).toEqual([])
    expect(store.loading()).toBe(false)
  })
  it("rejects earlier role loads after a newer load completes", () => {
    const first = new Subject<Result<PermissionAssignment, RbacError>>()
    const second = new Subject<Result<PermissionAssignment, RbacError>>()
    TestBed.configureTestingModule({
      providers: [
        {
          provide: RBAC_REPOSITORY,
          useValue: {
            getRolePermissions: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
          }
        }
      ]
    })
    const store = TestBed.inject(RbacStore)
    store.loadPermissions(19).subscribe()
    store.loadPermissions(19, true).subscribe()
    second.next(Result.success({ roleId: 19, permissions: [] }))
    second.complete()
    first.next(
      Result.success({
        roleId: 19,
        permissions: [{ id: 73, code: "STALE", module: "Backend", description: "Stale" }]
      })
    )
    first.complete()
    expect(store.matrices()[19].permissions).toEqual([])
    expect(store.loading()).toBe(false)
  })
  it("cancels component-owned queries without leaving pending state", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: RBAC_REPOSITORY, useValue: { getRolePermissions: () => new Subject() } }
      ]
    })
    const store = TestBed.inject(RbacStore)
    const subscription = store.loadPermissions(19).subscribe()
    expect(store.loading()).toBe(true)
    subscription.unsubscribe()
    expect(store.loading()).toBe(false)
  })
  it("rejects inconsistent response identity rather than returning success", async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: RBAC_REPOSITORY,
          useValue: {
            getRolePermissions: () => of(Result.success({ roleId: 23, permissions: [] })),
            saveRolePermissions: () => of(Result.success({ roleId: 23, permissions: [] }))
          }
        }
      ]
    })
    const store = TestBed.inject(RbacStore)
    expect(await firstValueFrom(store.loadPermissions(19))).toMatchObject({
      success: false,
      error: { code: "INVALID_RESPONSE" }
    })
    expect(await firstValueFrom(store.savePermissionIds(19, []))).toMatchObject({
      success: false,
      error: { code: "INVALID_RESPONSE" }
    })
    expect(store.matrices()[19]).toBeUndefined()
  })
  it("blocks duplicate writes and snapshots atomic IDs", async () => {
    const pending = new Subject<Result<PermissionAssignment, RbacError>>()
    const save = vi.fn().mockReturnValue(pending)
    TestBed.configureTestingModule({
      providers: [{ provide: RBAC_REPOSITORY, useValue: { saveRolePermissions: save } }]
    })
    const store = TestBed.inject(RbacStore)
    const ids = [73]
    const operation = store.savePermissionIds(19, ids)
    ids.push(0)
    const subscription = operation.subscribe()
    expect(save).toHaveBeenCalledExactlyOnceWith(19, [73])
    expect(await firstValueFrom(store.savePermissionIds(19, []))).toMatchObject({
      success: false,
      error: { code: "BUSY" }
    })
    subscription.unsubscribe()
    expect(store.loading()).toBe(false)
    store.savePermissionIds(19, []).subscribe().unsubscribe()
    expect(save).toHaveBeenCalledTimes(2)
  })
})
