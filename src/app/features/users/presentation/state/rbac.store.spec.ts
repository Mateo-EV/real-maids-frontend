import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, Subject } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { RBAC_REPOSITORY } from "../../domain/repositories/rbac.repository"
import { PermissionAssignment } from "../../domain/entities/permission.entity"
import { RbacError } from "../../domain/errors/rbac.error"
import { RbacStore } from "./rbac.store"
import { signal } from "@angular/core"
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
