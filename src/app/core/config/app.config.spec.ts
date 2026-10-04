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
