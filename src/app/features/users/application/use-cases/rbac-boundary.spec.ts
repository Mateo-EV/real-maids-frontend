import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { appConfig } from "@/app/core/config/app.config"
import { GetRolePermissionsUseCase } from "./get-role-permissions.use-case"
import { SaveRolePermissionsUseCase } from "./save-role-permissions.use-case"
import { RBAC_REPOSITORY } from "../../domain/repositories/rbac.repository"
import { RbacRepositoryImpl } from "../../infrastructure/repositories/rbac.repository-impl"
import { RbacInMemorySource } from "../../infrastructure/source/rbac-in-memory.source"
import { RbacError } from "../../domain/errors/rbac.error"

describe("RBAC application/repository boundary", () => {
  afterEach(() => vi.useRealTimers())
  it("delegates stateless execute actions and preserves failures", async () => {
    const failure = Result.failure(new RbacError("ROLE_NOT_FOUND"))
    const repository = {
      getRolePermissions: vi.fn(() => of(failure)),
      saveRolePermissions: vi.fn(() => of(failure))
    }
    TestBed.configureTestingModule({
      providers: [{ provide: RBAC_REPOSITORY, useValue: repository }]
    })
    expect(await firstValueFrom(TestBed.inject(GetRolePermissionsUseCase).execute(999))).toBe(
      failure
    )
    expect(await firstValueFrom(TestBed.inject(SaveRolePermissionsUseCase).execute(999, []))).toBe(
      failure
    )
    expect(repository.getRolePermissions).toHaveBeenCalledExactlyOnceWith(999)
    expect(repository.saveRolePermissions).toHaveBeenCalledExactlyOnceWith(999, [])
  })
  it("aliases the distinct root repository and shares its source across query/save", async () => {
    vi.useFakeTimers()
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const repository = TestBed.inject(RBAC_REPOSITORY)
    expect(repository).toBe(TestBed.inject(RbacRepositoryImpl))
    expect(repository).not.toBe(TestBed.inject(RbacInMemorySource))
    const save = firstValueFrom(
      TestBed.inject(SaveRolePermissionsUseCase).execute(1, [{ module: "crm", action: "read" }])
    )
    await vi.advanceTimersByTimeAsync(500)
    expect((await save).success).toBe(true)
    const query = firstValueFrom(TestBed.inject(GetRolePermissionsUseCase).execute(1))
    await vi.advanceTimersByTimeAsync(500)
    const result = await query
    if (!result.success) throw result.error
    expect(result.data).toEqual({
      roleId: 1,
      configured: true,
      grants: [{ module: "crm", action: "read" }]
    })
  })
})
