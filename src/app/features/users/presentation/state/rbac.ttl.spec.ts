import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable, of, Subject } from "rxjs"
import { PLATFORM_ID, signal } from "@angular/core"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Permission, PermissionAssignment } from "../../domain/entities/permission.entity"
import { RbacError } from "../../domain/errors/rbac.error"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { RBAC_REPOSITORY } from "../../domain/repositories/rbac.repository"
import { RbacStore } from "./rbac.store"

const session = AuthSession.create("Tester", "tester@example.test", null, null, 1)
function setup(server = false) {
  const changes = new Subject<AuthSession | null>()
  const auth = { session: signal<AuthSession | null>(session) }
  const catalog = vi.fn<() => Observable<Result<Permission[], RbacError>>>(() =>
    of(Result.success([]))
  )
  const query = vi.fn<(id: number) => Observable<Result<PermissionAssignment, RbacError>>>(id =>
    of(Result.success({ roleId: id, permissions: [] }))
  )
  const save = vi.fn((id: number) => of(Result.success({ roleId: id, permissions: [] })))
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: server ? "server" : "browser" },
      { provide: AuthStore, useValue: auth },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
      {
        provide: RBAC_REPOSITORY,
        useValue: { getPermissions: catalog, getRolePermissions: query, saveRolePermissions: save }
      }
    ]
  })
  return { store: TestBed.inject(RbacStore), auth, changes, catalog, query, save }
}
describe("RBAC read freshness", () => {
  it("shares requests, retains stale empty assignments and renews freshness only on success", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    try {
      const { store, query } = setup()
      store.loadPermissions(19).subscribe()
      const pending = new Subject<Result<PermissionAssignment, RbacError>>()
      query.mockReturnValue(pending)
      now.mockReturnValue(31000)
      const first = store.loadPermissions(19).subscribe()
      const second = store.loadPermissions(19).subscribe()
      expect(query).toHaveBeenCalledTimes(2)
      expect(store.assignmentEntries()[19]).toMatchObject({
        refreshing: true,
        loading: false,
        expires: 31000
      })
      first.unsubscribe()
      expect(pending.observed).toBe(true)
      pending.next(Result.failure(new RbacError("FORBIDDEN")))
      pending.complete()
      expect(store.assignmentEntries()[19]).toMatchObject({
        result: { permissions: [] },
        expires: 31000,
        refreshing: false,
        error: { code: "FORBIDDEN" }
      })
      store.loadPermissions(19).subscribe().unsubscribe()
      expect(query).toHaveBeenCalledTimes(3)
      second.unsubscribe()
      expect(store.loading()).toBe(false)
    } finally {
      now.mockRestore()
    }
  })
  it("forces fresh reads and invalidates on write dispatch without replay", () => {
    const { store, query, save } = setup()
    store.loadPermissions(19).subscribe()
    store.loadPermissions(19, true).subscribe()
    expect(query).toHaveBeenCalledTimes(2)
    store.savePermissionIds(19, []).subscribe()
    expect(save).toHaveBeenCalledTimes(1)
    expect(store.assignmentEntries()[19].expires).toBe(0)
    store.loadPermissions(19).subscribe()
    expect(query).toHaveBeenCalledTimes(3)
  })
  it("clears and fences old session reads but preserves same-session renewal", () => {
    const { store, query, auth, changes } = setup()
    store.loadPermissions(19).subscribe()
    changes.next(AuthSession.create("Tester", "tester@example.test", null, null, 1))
    store.loadPermissions(19).subscribe()
    expect(query).toHaveBeenCalledTimes(1)
    const pending = new Subject<Result<PermissionAssignment, RbacError>>()
    query.mockReturnValue(pending)
    store.loadPermissions(23).subscribe()
    auth.session.set(null)
    changes.next(null)
    pending.next(Result.success({ roleId: 23, permissions: [] }))
    expect(store.matrices()).toEqual({})
    expect(store.assignmentEntries()).toEqual({})
    expect(pending.observed).toBe(false)
    expect(store.loading()).toBe(false)
  })
  it("never dispatches server reads", () => {
    const { store, query, catalog } = setup(true)
    store.loadPermissions(19).subscribe()
    store.loadCatalog().subscribe()
    expect(query).not.toHaveBeenCalled()
    expect(catalog).not.toHaveBeenCalled()
  })
  it("keeps active roles pinned and rejects excess concurrent reads rather than evicting them", () => {
    const { store, query } = setup()
    store.loadPermissions(0).subscribe()
    const release = store.retainRole(0)
    for (let id = 1; id < 25; id++) store.loadPermissions(id).subscribe()
    expect(store.assignmentEntries()[0].result).toEqual({ roleId: 0, permissions: [] })
    release()
    const pending = new Subject<Result<PermissionAssignment, RbacError>>()
    query.mockReturnValue(pending)
    const subscriptions = Array.from({ length: 20 }, (_, id) =>
      store.loadPermissions(100 + id).subscribe()
    )
    let code = ""
    store.loadPermissions(999).subscribe(result => {
      if (!result.success) code = result.error.code
    })
    expect(code).toBe("BUSY")
    expect(Object.keys(store.assignmentEntries())).toHaveLength(20)
    subscriptions.forEach(subscription => subscription.unsubscribe())
    expect(pending.observed).toBe(false)
    expect(store.loading()).toBe(false)
  })
  it("retains verified empty catalog on failed force retry and cancellation settles read flags", () => {
    const { store, catalog } = setup()
    store.loadCatalog().subscribe()
    const expiry = store.catalogEntry().expires
    const failure = new RbacError("NETWORK")
    catalog.mockReturnValueOnce(of(Result.failure(failure)))
    store.loadCatalog(true).subscribe()
    expect(store.catalogEntry()).toMatchObject({ result: [], expires: expiry, error: failure })
    const pending = new Subject<never>()
    catalog.mockReturnValueOnce(pending)
    const subscription = store.loadCatalog(true).subscribe()
    expect(store.catalogEntry().refreshing).toBe(true)
    subscription.unsubscribe()
    expect(store.catalogEntry()).toMatchObject({
      refreshing: false,
      loading: false,
      expires: expiry
    })
  })
  it("fences pending writes on session replacement and leaves initial failures unverified", () => {
    const { store, query, save, auth, changes } = setup()
    query.mockReturnValueOnce(of(Result.failure(new RbacError("FORBIDDEN"))))
    store.loadPermissions(19).subscribe()
    expect(store.assignmentEntries()[19]).toMatchObject({
      result: undefined,
      expires: 0,
      error: { code: "FORBIDDEN" }
    })
    const pending = new Subject<never>()
    save.mockReturnValueOnce(pending)
    store.savePermissionIds(19, []).subscribe()
    const replacement = AuthSession.create("Other", "other@example.test", null, null, 2)
    auth.session.set(replacement)
    changes.next(replacement)
    expect(pending.observed).toBe(false)
    expect(store.assignmentEntries()).toEqual({})
    expect(store.matrices()).toEqual({})
    expect(store.loading()).toBe(false)
  })
  it("pins superseded in-flight reads and rejects their responses during bounded history churn", () => {
    const { store, query } = setup()
    const old = new Subject<Result<PermissionAssignment, RbacError>>()
    query.mockReturnValueOnce(old)
    store.loadPermissions(19).subscribe()
    store.loadPermissions(19, true).subscribe()
    for (let id = 20; id < 45; id++) store.loadPermissions(id).subscribe()
    expect(store.assignmentEntries()[19]).toBeDefined()
    store.loadPermissions(19).subscribe()
    old.next(
      Result.success({
        roleId: 19,
        permissions: [{ id: 99, code: "STALE", module: "Old", description: "Old" }]
      })
    )
    old.complete()
    expect(store.assignmentEntries()[19].result?.permissions).toEqual([])
  })
  it("bounds inactive role histories", () => {
    const { store } = setup()
    for (let id = 0; id < 25; id++) store.loadPermissions(id).subscribe()
    expect(Object.keys(store.assignmentEntries())).toHaveLength(20)
    expect(Object.keys(store.matrices())).toHaveLength(20)
  })
  it("reuses the catalog and independent role assignments until the exact thirty-second boundary", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    const catalog = vi.fn(() => of(Result.success([])))
    const query = vi.fn((roleId: number) => of(Result.success({ roleId, permissions: [] })))
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { session: signal(session) } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => new Subject() } },
        {
          provide: RBAC_REPOSITORY,
          useValue: { getPermissions: catalog, getRolePermissions: query }
        }
      ]
    })
    try {
      const store = TestBed.inject(RbacStore)
      await firstValueFrom(store.loadCatalog())
      await firstValueFrom(store.loadPermissions(19))
      await firstValueFrom(store.loadPermissions(23))
      now.mockReturnValue(30999)
      await firstValueFrom(store.loadCatalog())
      await firstValueFrom(store.loadPermissions(19))
      expect(catalog).toHaveBeenCalledTimes(1)
      expect(query).toHaveBeenCalledTimes(2)
      now.mockReturnValue(31000)
      expect(query).toHaveBeenCalledTimes(2)
      await firstValueFrom(store.loadCatalog())
      await firstValueFrom(store.loadPermissions(19))
      expect(catalog).toHaveBeenCalledTimes(2)
      expect(query).toHaveBeenCalledTimes(3)
    } finally {
      now.mockRestore()
    }
  })
})
