import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appConfig } from "./app.config"
import { AUTH_REPOSITORY } from "@/app/features/auth/domain/repositories/auth.repository"
import { AuthInMemorySource } from "@/app/features/auth/infrastructure/source/auth-in-memory.source"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { CUSTOMER_REPOSITORY } from "@/app/features/customers/domain/repositories/customer.repository"
import { CustomerInMemorySource } from "@/app/features/customers/infrastructure/source/customer-in-memory.source"
import { CustomersStore } from "@/app/features/customers/presentation/state/customers.store"
import { AdminHomePage } from "@/app/experiences/admin/presentation/pages/admin-home-page/admin-home-page"

import { USER_REPOSITORY } from "@/app/features/users/domain/repositories/user.repository"
import { UserInMemorySource } from "@/app/features/users/infrastructure/source/user-in-memory.source"
import { CreateUserUseCase } from "@/app/features/users/application/use-cases/create-user.use-case"
import { GetUserByIdUseCase } from "@/app/features/users/application/use-cases/get-user-by-id.use-case"
import { Lang } from "@/app/features/users/domain/entities/user.entity"
import { ROLE_REPOSITORY } from "@/app/features/users/domain/repositories/role.repository"
import { RoleInMemorySource } from "@/app/features/users/infrastructure/source/role-in-memory.source"
import { RolesStore } from "@/app/features/users/presentation/state/roles.store"
import { UserStore } from "@/app/features/users/presentation/state/user.store"
import { GetRoleByIdUseCase } from "@/app/features/users/application/use-cases/get-role-by-id.use-case"

describe("Application repository composition", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: appConfig.providers })
    vi.useFakeTimers()
  })

  afterEach(() => vi.useRealTimers())

  it("aliases the auth token to the root source instance", () => {
    expect(TestBed.inject(AUTH_REPOSITORY)).toBe(TestBed.inject(AuthInMemorySource))
  })

  it("aliases the customer token to the root source instance", () => {
    expect(TestBed.inject(CUSTOMER_REPOSITORY)).toBe(TestBed.inject(CustomerInMemorySource))
  })

  it("aliases the user token to the root source instance", () => {
    expect(TestBed.inject(USER_REPOSITORY)).toBe(TestBed.inject(UserInMemorySource))
  })

  it("aliases roles and shares store/use-case mutations without a DI cycle", async () => {
    const source = TestBed.inject(RoleInMemorySource)
    expect(TestBed.inject(ROLE_REPOSITORY)).toBe(source)
    const roles = TestBed.inject(RolesStore)
    const users = TestBed.inject(UserStore)
    expect(TestBed.inject(RolesStore)).toBe(roles)
    expect(TestBed.inject(UserStore)).toBe(users)
    const created = await firstValueFrom(roles.createRole({ name: "Demo", description: "Fictitious", isActive: true }))
    if (!created.success) throw created.error
    expect(await firstValueFrom(TestBed.inject(GetRoleByIdUseCase).execute(created.data.id))).toEqual(created)
    const user = await firstValueFrom(users.createUser({ name: "Demo", age: 30, email: "demo@example.com",
      password: "unused", lang: Lang.EN, isActive: false, roleId: created.data.id }))
    if (!user.success) throw user.error
    expect(user.data.lastAccess).toBeNull()
    expect(await firstValueFrom(roles.deleteRoleById(created.data.id))).toMatchObject({ success: false, error: { code: "ROLE_IN_USE" } })
    expect(roles.roles()).toEqual([created.data])
    await firstValueFrom(users.deleteUserById(user.data.id))
    expect((await firstValueFrom(roles.deleteRoleById(created.data.id))).success).toBe(true)
    expect((await firstValueFrom(source.getRoles()))).toMatchObject({ success: true, data: [] })
  })

  it("shares user mutations between root use cases and the source", async () => {
    const result = await firstValueFrom(TestBed.inject(CreateUserUseCase).execute({
      name: "Demo user", age: 30, email: "user@example.com", password: "demo-only",
      lang: Lang.EN, isActive: true, roleId: 1
    }))
    if (!result.success) throw new Error("Expected successful user creation")
    const found = await firstValueFrom(TestBed.inject(GetUserByIdUseCase).execute(result.data.id))
    const source = await firstValueFrom(TestBed.inject(UserInMemorySource).getUserById(result.data.id))
    expect(found).toEqual(result)
    expect(source).toEqual(result)
    expect(TestBed.inject(CreateUserUseCase)).toBe(TestBed.inject(CreateUserUseCase))
  })

  it("connects root auth state, its source and admin logout", async () => {
    const store = TestBed.inject(AuthStore)
    const source = TestBed.inject(AuthInMemorySource)
    const login = firstValueFrom(store.login({ email: "riojamatthew@gmail.com", password: "demo2026" }))
    await vi.runAllTimersAsync()
    expect((await login).success).toBe(true)
    expect(store.isAuthenticated()).toBe(true)

    const session = firstValueFrom(source.me())
    await vi.runAllTimersAsync()
    expect((await session).success).toBe(true)

    const navigate = vi.spyOn(TestBed.inject(Router), "navigateByUrl").mockResolvedValue(true)
    const page = TestBed.runInInjectionContext(() => new AdminHomePage())
    page.logout()

    expect(store.isAuthenticated()).toBe(false)
    expect(page.session()).toBeNull()
    expect(navigate).toHaveBeenCalledWith("/login")
    const loggedOut = firstValueFrom(source.me())
    await vi.runAllTimersAsync()
    expect((await loggedOut).success).toBe(false)
    expect(TestBed.inject(AuthStore)).toBe(store)
  })

  it("shares customer mutations between the root store and source", async () => {
    const store = TestBed.inject(CustomersStore)
    const created = firstValueFrom(store.createCustomer({
      name: "Demo customer", email: "demo@example.com", phone: "+1 555 010 1003"
    }))
    await vi.runAllTimersAsync()
    const result = await created
    expect(result.success).toBe(true)
    if (!result.success) throw new Error("Expected successful customer creation")

    const found = firstValueFrom(TestBed.inject(CustomerInMemorySource).findById(result.data.id))
    await vi.runAllTimersAsync()
    const sourceResult = await found
    expect(sourceResult.success).toBe(true)
    if (!sourceResult.success) throw new Error("Expected customer in root source")
    expect(sourceResult.data).toEqual(result.data)
    expect(TestBed.inject(CustomersStore)).toBe(store)
  })
})
