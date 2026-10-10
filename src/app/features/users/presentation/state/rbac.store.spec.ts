import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, Subject } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { RBAC_REPOSITORY } from "../../domain/repositories/rbac.repository"
import { RbacMatrix } from "../../domain/models/rbac-matrix"
import { RbacError } from "../../domain/errors/rbac.error"
import { RbacStore } from "./rbac.store"

describe("RbacStore", () => {
  it("keeps loaded data on query failure and ignores stale loads after save", async () => {
    const initial: RbacMatrix = {
      roleId: 2,
      configured: true,
      grants: [{ module: "crm", action: "read" }]
    }
    const delayed = new Subject<Result<RbacMatrix, RbacError>>()
    const repository = {
      getRolePermissions: vi
        .fn()
        .mockReturnValueOnce(of(Result.success(initial)))
        .mockReturnValueOnce(delayed)
        .mockReturnValue(of(Result.failure(new RbacError("UNEXPECTED")))),
      saveRolePermissions: vi.fn((roleId: number) =>
        of(Result.success({ roleId, configured: true, grants: [] }))
      )
    }
    TestBed.configureTestingModule({
      providers: [{ provide: RBAC_REPOSITORY, useValue: repository }]
    })
    const store = TestBed.inject(RbacStore)
    await firstValueFrom(store.loadPermissions(2))
    const stale = store.loadPermissions(2).subscribe()
    await firstValueFrom(store.savePermissions(2, []))
    delayed.next(Result.success(initial))
    delayed.complete()
    stale.unsubscribe()
    expect(store.matrices()[2].grants).toEqual([])
    await firstValueFrom(store.loadPermissions(2))
    expect(store.matrices()[2].configured).toBe(true)
    expect(store.loading()).toBe(false)
  })
  it("cancels component-owned queries without leaving pending state", () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: RBAC_REPOSITORY, useValue: { getRolePermissions: () => new Subject() } }
      ]
    })
    const store = TestBed.inject(RbacStore)
    const subscription = store.loadPermissions(2).subscribe()
    expect(store.loading()).toBe(true)
    subscription.unsubscribe()
    expect(store.loading()).toBe(false)
  })
})
