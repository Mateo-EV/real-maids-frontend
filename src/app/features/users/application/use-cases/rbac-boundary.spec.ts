import { TestBed } from "@angular/core/testing"
import { provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { appConfig } from "@/app/core/config/app.config"
import { GetPermissionsUseCase } from "./get-permissions.use-case"
import { GetRolePermissionsUseCase } from "./get-role-permissions.use-case"
import { SaveRolePermissionsUseCase } from "./save-role-permissions.use-case"
import { RBAC_REPOSITORY } from "../../domain/repositories/rbac.repository"
import { RbacRepositoryImpl } from "../../infrastructure/repositories/rbac.repository-impl"
import { RbacHttpSource } from "../../infrastructure/source/rbac-http.source"
import { RbacError } from "../../domain/errors/rbac.error"
describe("RBAC application/repository boundary", () => {
  it("delegates stateless catalog/query/save actions and preserves failures", async () => {
    const failure = Result.failure(new RbacError("ROLE_NOT_FOUND"))
    const repository = {
      getPermissions: vi.fn(() => of(failure)),
      getRolePermissions: vi.fn(() => of(failure)),
      saveRolePermissions: vi.fn(() => of(failure))
    }
    TestBed.configureTestingModule({
      providers: [{ provide: RBAC_REPOSITORY, useValue: repository }]
    })
    expect(await firstValueFrom(TestBed.inject(GetPermissionsUseCase).execute())).toBe(failure)
    expect(await firstValueFrom(TestBed.inject(GetRolePermissionsUseCase).execute(999))).toBe(
      failure
    )
    expect(
      await firstValueFrom(TestBed.inject(SaveRolePermissionsUseCase).execute(999, [73, 0]))
    ).toBe(failure)
    expect(repository.getPermissions).toHaveBeenCalledExactlyOnceWith()
    expect(repository.getRolePermissions).toHaveBeenCalledExactlyOnceWith(999)
    expect(repository.saveRolePermissions).toHaveBeenCalledExactlyOnceWith(999, [73, 0])
  })
  it("aliases the root implementation and delegates exact observables to its shared HTTP source", () => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()]
    })
    const repository = TestBed.inject(RBAC_REPOSITORY)
    const source = TestBed.inject(RbacHttpSource)
    expect(repository).toBe(TestBed.inject(RbacRepositoryImpl))
    expect(repository).not.toBe(source)
    const response = of(Result.failure(new RbacError("FORBIDDEN")))
    const query = vi.spyOn(source, "getRolePermissions").mockReturnValue(response)
    const save = vi.spyOn(source, "saveRolePermissions").mockReturnValue(response)
    const catalog = vi.spyOn(source, "getPermissions").mockReturnValue(response)
    expect(repository.getPermissions()).toBe(response)
    expect(repository.getRolePermissions(19)).toBe(response)
    expect(repository.saveRolePermissions(19, [])).toBe(response)
    expect(query).toHaveBeenCalledExactlyOnceWith(19)
    expect(save).toHaveBeenCalledExactlyOnceWith(19, [])
    expect(catalog).toHaveBeenCalledExactlyOnceWith()
  })
})
