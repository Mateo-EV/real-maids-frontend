import { TestBed } from "@angular/core/testing"
import { provideHttpClientTesting } from "@angular/common/http/testing"
import { of } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { appConfig } from "@/app/core/config/app.config"
import { Result } from "@/app/shared/utils/result"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { AuthRepositoryImpl } from "@/app/features/auth/infrastructure/repositories/auth.repository-impl"
import { AuthHttpSource } from "@/app/features/auth/infrastructure/source/auth-http.source"
import { CustomerError } from "@/app/features/customers/domain/errors/customer.error"
import { Customer } from "@/app/features/customers/domain/entities/customer.entity"
import { CustomerRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/customer.repository-impl"
import { CustomerInMemorySource } from "@/app/features/customers/infrastructure/source/customer-in-memory.source"
import { UserError } from "../../domain/errors/user.error"
import { RoleError } from "../../domain/errors/role.error"
import { Lang } from "../../domain/entities/user.entity"
import { UserHttpSource } from "../source/user-http.source"
import { RoleHttpSource } from "../source/role-http.source"
import { UserRepositoryImpl } from "./user.repository-impl"
import { RoleRepositoryImpl } from "./role.repository-impl"

import { AuditLogError } from "../../domain/errors/audit-log.error"
import { AuditLogHttpSource } from "../source/audit-log-http.source"
import { AuditLogRepositoryImpl } from "./audit-log.repository-impl"

describe("Infrastructure repository delegation", () => {
  it("delegates audit pagination preserving the exact observable", () => {
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const source = TestBed.inject(AuditLogHttpSource)
    const repository = TestBed.inject(AuditLogRepositoryImpl)
    const response = of(Result.failure(new AuditLogError("INVALID_PAGINATION")))
    const query = vi.spyOn(source, "getAuditLogs").mockReturnValue(response)
    const params = { page: 3, size: 7 }
    expect(repository.getAuditLogs(params)).toBe(response)
    expect(query).toHaveBeenCalledExactlyOnceWith(params)
    query.mockClear()
    expect(repository.getAuditLogs()).toBe(response)
    expect(query).toHaveBeenCalledExactlyOnceWith(undefined)
  })

  it("delegates complete filtered audit and per-ID detail preserving observables", () => {
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const source = TestBed.inject(AuditLogHttpSource)
    const repository = TestBed.inject(AuditLogRepositoryImpl)
    const response = of(Result.failure(new AuditLogError("INVALID_FILTER")))
    const all = vi.spyOn(source, "exportAuditLogs").mockReturnValue(response)
    const detail = vi.spyOn(source, "getAuditLogById").mockReturnValue(response)
    const filters = { dayUTC: "2026-09-01", entity: "usuario" as const, action: "UPDATE" as const }
    expect(repository.exportAuditLogs(filters)).toBe(response)
    expect(all).toHaveBeenCalledExactlyOnceWith(filters)
    expect(repository.getAuditLogById(42)).toBe(response)
    expect(detail).toHaveBeenCalledExactlyOnceWith(42)
  })

  afterEach(() => vi.restoreAllMocks())

  it("delegates auth login, local current session and synchronous logout to the shared HTTP source", () => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()]
    })
    const source = TestBed.inject(AuthHttpSource)
    const repository = TestBed.inject(AuthRepositoryImpl)
    const response = of(Result.failure(new AuthError("UNEXPECTED")))
    const login = vi.spyOn(source, "login").mockReturnValue(response)
    const me = vi.spyOn(source, "me").mockReturnValue(response)
    const logout = vi.spyOn(source, "logout").mockImplementation(() => {})
    const params = { email: "demo@example.com", password: "unused" }
    expect(repository.login(params)).toBe(response)
    expect(login).toHaveBeenCalledExactlyOnceWith(params)
    expect(repository.me()).toBe(response)
    expect(me).toHaveBeenCalledExactlyOnceWith()
    repository.logout()
    expect(logout).toHaveBeenCalledExactlyOnceWith()
  })

  it("delegates all customer operations without mapping or swallowing failures", () => {
    const source = TestBed.inject(CustomerInMemorySource)
    const repository = TestBed.inject(CustomerRepositoryImpl)
    const response = of(Result.failure(new CustomerError("CUSTOMER_NOT_FOUND")))
    const all = vi.spyOn(source, "findAll").mockReturnValue(response)
    const read = vi.spyOn(source, "findById").mockReturnValue(response)
    const create = vi.spyOn(source, "create").mockReturnValue(response)
    const update = vi.spyOn(source, "update").mockReturnValue(response)
    const remove = vi.spyOn(source, "delete").mockReturnValue(response)
    const customer = new Customer("customer-001", "Demo", "demo@example.com", "123")
    expect(repository.findAll()).toBe(response)
    expect(repository.findById(customer.id)).toBe(response)
    expect(repository.create(customer)).toBe(response)
    expect(repository.update(customer)).toBe(response)
    expect(repository.delete(customer.id)).toBe(response)
    expect(all).toHaveBeenCalledExactlyOnceWith()
    expect(read).toHaveBeenCalledExactlyOnceWith(customer.id)
    expect(create).toHaveBeenCalledExactlyOnceWith(customer)
    expect(update).toHaveBeenCalledExactlyOnceWith(customer)
    expect(remove).toHaveBeenCalledExactlyOnceWith(customer.id)
  })

  it("delegates every user operation preserving fields and the exact observable", () => {
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const source = TestBed.inject(UserHttpSource)
    const repository = TestBed.inject(UserRepositoryImpl)
    const response = of(Result.failure(new UserError("USER_NOT_FOUND")))
    const create = vi.spyOn(source, "createUser").mockReturnValue(response)
    const read = vi.spyOn(source, "getUserById").mockReturnValue(response)
    const list = vi.spyOn(source, "getUsers").mockReturnValue(response)
    const update = vi.spyOn(source, "updateUserById").mockReturnValue(response)
    const status = vi.spyOn(source, "updateUserStatusById").mockReturnValue(response)
    const remove = vi.spyOn(source, "deleteUserById").mockReturnValue(response)
    const params = {
      name: "Demo",
      email: "demo@example.com",
      password: "unused",
      lang: Lang.EN,
      isActive: false,
      roleId: 2,
      lastAccess: new Date("2026-01-01")
    }
    expect(repository.createUser(params)).toBe(response)
    expect(repository.getUserById(1)).toBe(response)
    expect(repository.getUsers()).toBe(response)
    expect(repository.updateUserById(1, params)).toBe(response)
    expect(repository.updateUserStatusById(1, false)).toBe(response)
    expect(status).toHaveBeenCalledExactlyOnceWith(1, false)
    expect(repository.deleteUserById(1)).toBe(response)
    expect(create).toHaveBeenCalledExactlyOnceWith(params)
    expect(read).toHaveBeenCalledExactlyOnceWith(1)
    expect(list).toHaveBeenCalledExactlyOnceWith({})
    expect(update).toHaveBeenCalledExactlyOnceWith(1, params)
    expect(remove).toHaveBeenCalledExactlyOnceWith(1)
  })

  it("delegates every role operation using the shared source and preserves failures", () => {
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const source = TestBed.inject(RoleHttpSource)
    const repository = TestBed.inject(RoleRepositoryImpl)
    const response = of(Result.failure(new RoleError("ROLE_IN_USE")))
    const create = vi.spyOn(source, "createRole").mockReturnValue(response)
    const read = vi.spyOn(source, "getRoleById").mockReturnValue(response)
    const list = vi.spyOn(source, "getRoles").mockReturnValue(response)
    const update = vi.spyOn(source, "updateRoleById").mockReturnValue(response)
    const remove = vi.spyOn(source, "deleteRoleById").mockReturnValue(response)
    const params = { name: "Demo", description: "Fictitious", isActive: false }
    expect(repository.createRole(params)).toBe(response)
    expect(repository.getRoleById(1)).toBe(response)
    expect(repository.getRoles()).toBe(response)
    expect(repository.updateRoleById(1, params)).toBe(response)
    expect(repository.deleteRoleById(1)).toBe(response)
    expect(create).toHaveBeenCalledExactlyOnceWith(params)
    expect(read).toHaveBeenCalledExactlyOnceWith(1)
    expect(list).toHaveBeenCalledExactlyOnceWith()
    expect(update).toHaveBeenCalledExactlyOnceWith(1, params)
    expect(remove).toHaveBeenCalledExactlyOnceWith(1)
  })
})
