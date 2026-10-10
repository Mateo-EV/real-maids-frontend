import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { RoleError } from "../../domain/errors/role.error"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RbacInMemorySource } from "./rbac-in-memory.source"
import { RoleInMemorySource } from "./role-in-memory.source"
import { USER_REPOSITORY } from "../../domain/repositories/user.repository"
import { UserInMemorySource } from "./user-in-memory.source"
import { RbacGrant } from "../../domain/models/rbac-matrix"

describe("RbacInMemorySource", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    TestBed.configureTestingModule({
      providers: [{ provide: USER_REPOSITORY, useExisting: UserInMemorySource }]
    })
  })
  afterEach(() => vi.useRealTimers())
  async function finish<T>(request: Promise<T>) {
    await vi.advanceTimersByTimeAsync(500)
    return request
  }
  it("seeds only the illustrated Operations matrix and returns defensive copies", async () => {
    const source = TestBed.inject(RbacInMemorySource)
    const result = await finish(firstValueFrom(source.getRolePermissions(2)))
    if (!result.success) throw result.error
    expect(result.data.configured).toBe(true)
    expect(result.data.grants).toHaveLength(19)
    const byModule = Object.fromEntries(
      ["security", "landing", "crm", "customers", "scheduling", "billing", "configuration"].map(
        module => [module, result.data.grants.filter(g => g.module === module).map(g => g.action)]
      )
    )
    expect(byModule).toEqual({
      security: ["read", "create", "update", "export"],
      landing: ["read"],
      crm: ["read", "create", "update", "export"],
      customers: ["read", "create", "update", "export"],
      scheduling: ["read", "create", "update", "delete", "export"],
      billing: ["read"],
      configuration: []
    })
    expect(result.data.grants.filter(g => g.module === "scheduling")).toHaveLength(5)
    expect(result.data.grants.some(g => g.module === "configuration")).toBe(false)
    result.data.grants.splice(0)
    const next = await finish(firstValueFrom(source.getRolePermissions(2)))
    if (!next.success) throw next.error
    expect(next.data.grants).toHaveLength(19)
    for (const id of [1, 3, 4, 5]) {
      const empty = await finish(firstValueFrom(source.getRolePermissions(id)))
      if (!empty.success) throw empty.error
      expect(empty.data).toEqual({ roleId: id, configured: false, grants: [] })
    }
  })
  it("saves captured input without exposing mutable stored grants", async () => {
    const source = TestBed.inject(RbacInMemorySource)
    const grants: RbacGrant[] = [{ module: "crm", action: "read" }]
    const pending = firstValueFrom(source.saveRolePermissions(1, grants))
    grants[0].action = "delete"
    const result = await finish(pending)
    if (!result.success) throw result.error
    expect(result.data.grants).toEqual([{ module: "crm", action: "read" }])
    result.data.grants[0].action = "delete"
    const next = await finish(firstValueFrom(source.getRolePermissions(1)))
    if (!next.success) throw next.error
    expect(next.data.grants[0].action).toBe("read")
    expect(next.data.configured).toBe(true)
  })
  it("rejects missing roles, unsupported modules/actions and duplicate grants", async () => {
    const source = TestBed.inject(RbacInMemorySource)
    const missing = await finish(firstValueFrom(source.getRolePermissions(999)))
    expect(missing.success).toBe(false)
    if (!missing.success) expect(missing.error.code).toBe("ROLE_NOT_FOUND")
    for (const grants of [
      [{ module: "missing", action: "read" }],
      [{ module: "crm", action: "missing" }],
      [
        { module: "crm", action: "read" },
        { module: "crm", action: "read" }
      ]
    ]) {
      const result = await finish(
        firstValueFrom(source.saveRolePermissions(1, grants as RbacGrant[]))
      )
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.code).toBe("INVALID_GRANTS")
    }
    expect((await finish(firstValueFrom(source.saveRolePermissions(999, [])))).success).toBe(false)
  })
  it("cancels before validation or mutation and checks current role existence after latency", async () => {
    const source = TestBed.inject(RbacInMemorySource)
    const roles = TestBed.inject(RoleInMemorySource)
    const lookup = vi.spyOn(roles, "getRoleById")
    const next = vi.fn()
    source.saveRolePermissions(1, []).subscribe(next).unsubscribe()
    await vi.advanceTimersByTimeAsync(500)
    expect(lookup).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
    const original = await finish(firstValueFrom(source.getRolePermissions(1)))
    if (!original.success) throw original.error
    expect(original.data.configured).toBe(false)
    const pending = firstValueFrom(source.saveRolePermissions(1, []))
    lookup.mockReturnValue(of(Result.failure(new RoleError("ROLE_NOT_FOUND"))))
    const result = await finish(pending)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe("ROLE_NOT_FOUND")
  })
})
