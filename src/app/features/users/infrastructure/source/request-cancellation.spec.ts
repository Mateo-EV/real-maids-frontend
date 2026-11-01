import { TestBed } from "@angular/core/testing"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom, Observable } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appConfig } from "@/app/core/config/app.config"
import { AUTH_REPOSITORY } from "@/app/features/auth/domain/repositories/auth.repository"
import { CUSTOMER_REPOSITORY } from "@/app/features/customers/domain/repositories/customer.repository"
import { AuthHttpSource } from "@/app/features/auth/infrastructure/source/auth-http.source"
import { CustomerInMemorySource } from "@/app/features/customers/infrastructure/source/customer-in-memory.source"
import { customerFixture, customerInput } from "@/app/features/customers/domain/customer.fixture"
import { USER_REPOSITORY } from "../../domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "../../domain/repositories/role.repository"
import { Lang } from "../../domain/entities/user.entity"
import { UserInMemorySource } from "./user-in-memory.source"
import { RoleInMemorySource } from "./role-in-memory.source"

import { AUDIT_LOG_REPOSITORY } from "../../domain/repositories/audit-log.repository"
import { AuditLogInMemorySource } from "./audit-log-in-memory.source"
import { provideHttpClient } from "@angular/common/http"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { AuditLogRepositoryImpl } from "../repositories/audit-log.repository-impl"

const userInput = {
  name: "Demo",
  email: "demo@example.com",
  password: "unused",
  lang: Lang.EN,
  isActive: false,
  roleId: 1
}
const roleInput = { name: "Demo", description: "Fictitious", isActive: true }

async function settle<T>(stream: Observable<T>): Promise<T> {
  const pending = firstValueFrom(stream)
  await vi.runAllTimersAsync()
  return pending
}

async function cancelBeforeBoundary<T>(stream: Observable<T>, latency: number) {
  const next = vi.fn()
  const subscription = stream.subscribe(next)
  await vi.advanceTimersByTimeAsync(latency - 1)
  expect(next).not.toHaveBeenCalled()
  subscription.unsubscribe()
  await vi.runAllTimersAsync()
  expect(next).not.toHaveBeenCalled()
}

describe("Real audit HTTP cancellation", () => {
  it("unsubscribes the dispatched read without feedback or a claim about server rollback", () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" },
        { provide: AUDIT_LOG_REPOSITORY, useExisting: AuditLogRepositoryImpl }
      ]
    })
    const next = vi.fn(),
      error = vi.fn(),
      complete = vi.fn()
    const subscription = TestBed.inject(AUDIT_LOG_REPOSITORY)
      .getAuditLogs({ page: 0, size: 5 })
      .subscribe({ next, error, complete })
    const http = TestBed.inject(HttpTestingController)
    const request = http.expectOne(r => r.url === "http://localhost:8080/api/auditoria")
    expect(request.request.method).toBe("GET")
    expect(request.cancelled).toBe(false)
    subscription.unsubscribe()
    expect(request.cancelled).toBe(true)
    expect(next).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
    http.verify()
  })
})

describe("Cancellable in-memory execution boundaries", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()]
    })
  })
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify()
    vi.useRealTimers()
  })

  it.each([1, 0])(
    "cancels legacy audit source limit=%s without results or errors before 250ms",
    async limit => {
      const repository = TestBed.inject(AuditLogInMemorySource)
      const next = vi.fn()
      const error = vi.fn()
      const complete = vi.fn()
      const query = repository.getAuditLogs({ limit })
      const subscription = query.subscribe({ next, error, complete })
      await vi.advanceTimersByTimeAsync(249)
      expect(next).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
      expect(complete).not.toHaveBeenCalled()
      subscription.unsubscribe()
      await vi.runAllTimersAsync()
      expect(next).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
      expect(complete).not.toHaveBeenCalled()

      query.subscribe({ next, error, complete })
      await vi.advanceTimersByTimeAsync(249)
      expect(next).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
      expect(complete).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(next).toHaveBeenCalledOnce()
      expect(error).not.toHaveBeenCalled()
      expect(complete).toHaveBeenCalledOnce()
      const result = next.mock.calls[0][0]
      if (limit === 1) {
        expect(result).toMatchObject({ success: true, data: { total: 48, offset: 0, limit: 1 } })
        expect(result.data.items).toHaveLength(1)
      } else {
        expect(result).toMatchObject({ success: false, error: { code: "INVALID_PAGINATION" } })
      }
    }
  )

  it("binds every domain repository to an implementation distinct from its shared source", () => {
    expect(TestBed.inject(AUTH_REPOSITORY)).not.toBe(TestBed.inject(AuthHttpSource))
    expect(TestBed.inject(CUSTOMER_REPOSITORY)).not.toBe(TestBed.inject(CustomerInMemorySource))
    expect(TestBed.inject(USER_REPOSITORY)).not.toBe(TestBed.inject(UserInMemorySource))
    expect(TestBed.inject(ROLE_REPOSITORY)).not.toBe(TestBed.inject(RoleInMemorySource))
  })

  for (const valid of [true, false]) {
    it(`cancels pending login with ${valid ? "valid-shaped" : "invalid-shaped"} password without establishing or persisting credentials`, async () => {
      const auth = TestBed.inject(AUTH_REPOSITORY)
      const http = TestBed.inject(HttpTestingController)
      const read = vi.spyOn(Storage.prototype, "getItem")
      const write = vi.spyOn(Storage.prototype, "setItem")
      const next = vi.fn()
      try {
        const password = valid ? "FakePassword1" : "wrong"
        const subscription = auth.login({ email: "fake@example.test", password }).subscribe(next)
        const request = http.expectOne("http://localhost:8080/api/auth/login")
        expect(request.request.body).toEqual({ correo: "fake@example.test", password })
        expect(next).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(649)
        expect(next).not.toHaveBeenCalled()
        subscription.unsubscribe()
        expect(request.cancelled).toBe(true)
        await vi.runAllTimersAsync()
        expect(next).not.toHaveBeenCalled()
        expect(await firstValueFrom(auth.me())).toMatchObject({ success: false })
        expect(read.mock.calls.some(([key]) => key === "authenticated")).toBe(false)
        expect(
          write.mock.calls.every(([, value]) => JSON.parse(String(value)).credentials === null)
        ).toBe(true)
      } finally {
        read.mockRestore()
        write.mockRestore()
      }
    })
  }

  it("cancels customer create/update/delete without mutations or ID allocation", async () => {
    const repository = TestBed.inject(CUSTOMER_REPOSITORY)
    const source = TestBed.inject(CustomerInMemorySource)
    const before = await settle(source.findAll())
    await cancelBeforeBoundary(
      repository.create(customerInput("Cancelled", "cancelled@example.com")),
      150
    )
    await cancelBeforeBoundary(
      repository.update(customerFixture(1, "Cancelled", "cancelled@example.com")),
      150
    )
    await cancelBeforeBoundary(repository.delete(2), 150)
    expect(await settle(source.findAll())).toEqual(before)
    expect(
      await settle(repository.create(customerInput("Completed", "completed@example.com")))
    ).toMatchObject({ success: true, data: { id: 3 } })
  })

  it("retains cancellable legacy demo user execution without mutations or ID allocation", async () => {
    const repository = TestBed.inject(UserInMemorySource)
    const source = TestBed.inject(UserInMemorySource)
    const before = await settle(source.getUsers())
    if (!before.success) throw before.error
    await cancelBeforeBoundary(repository.createUser(userInput), 250)
    const created = await settle(repository.createUser(userInput))
    expect(created).toMatchObject({ success: true, data: { id: 49 } })
    if (!created.success) throw created.error
    await cancelBeforeBoundary(
      repository.updateUserById(49, { ...userInput, name: "Cancelled" }),
      250
    )
    await cancelBeforeBoundary(repository.updateUserStatusById(49, true), 250)
    await cancelBeforeBoundary(repository.deleteUserById(49), 250)
    expect(await settle(source.getUsers())).toMatchObject({
      success: true,
      data: [...before.data, created.data]
    })
    expect(await settle(source.createUser(userInput))).toMatchObject({
      success: true,
      data: { id: 50 }
    })
  })

  it("retains cancellable legacy demo role execution without mutations or ID allocation", async () => {
    TestBed.overrideProvider(USER_REPOSITORY, {
      useFactory: () => TestBed.inject(UserInMemorySource)
    })
    const repository = TestBed.inject(RoleInMemorySource)
    const source = TestBed.inject(RoleInMemorySource)
    const before = await settle(source.getRoles())
    if (!before.success) throw before.error
    await cancelBeforeBoundary(repository.createRole(roleInput), 250)
    const created = await settle(repository.createRole(roleInput))
    expect(created).toMatchObject({ success: true, data: { id: 6 } })
    if (!created.success) throw created.error
    await cancelBeforeBoundary(
      repository.updateRoleById(6, { ...roleInput, name: "Cancelled" }),
      250
    )
    await cancelBeforeBoundary(repository.deleteRoleById(6), 250)
    expect(await settle(source.getRoles())).toMatchObject({
      success: true,
      data: [...before.data, created.data]
    })
    expect(await settle(source.createRole(roleInput))).toMatchObject({
      success: true,
      data: { id: 7 }
    })
  })

  it("cancels legacy demo role deletion during its reference query without deleting", async () => {
    TestBed.overrideProvider(USER_REPOSITORY, {
      useFactory: () => TestBed.inject(UserInMemorySource)
    })
    const roles = TestBed.inject(RoleInMemorySource)
    await settle(roles.createRole(roleInput))
    const next = vi.fn()
    const pending = roles.deleteRoleById(1).subscribe(next)
    await vi.advanceTimersByTimeAsync(250)
    expect(next).not.toHaveBeenCalled()
    pending.unsubscribe()
    await vi.runAllTimersAsync()
    expect(await settle(roles.getRoleById(1))).toMatchObject({ success: true, data: { id: 1 } })
    expect(next).not.toHaveBeenCalled()
  })

  it("ignores the demo flag, persists documented credentials and clears before remote logout", async () => {
    const auth = TestBed.inject(AUTH_REPOSITORY)
    const http = TestBed.inject(HttpTestingController)
    localStorage.setItem("authenticated", "true")
    const read = vi.spyOn(Storage.prototype, "getItem")
    const write = vi.spyOn(Storage.prototype, "setItem")
    try {
      const current = auth.me()
      expect(await firstValueFrom(current)).toMatchObject({ success: false })
      const pending = firstValueFrom(
        auth.login({ email: "fake@example.test", password: "FakePassword1" })
      )
      const request = http.expectOne("http://localhost:8080/api/auth/login")
      expect(await firstValueFrom(current)).toMatchObject({ success: false })
      request.flush({
        token: "fake-token",
        tipo: "Bearer",
        expiraEnSegundos: 60,
        refreshToken: "fake-refresh",
        refreshExpiraEnSegundos: 600,
        usuario: {
          idUsuario: 7,
          nombre: "Fake Name",
          correo: "returned@example.test",
          idRol: 3,
          rol: "Operaciones",
          idioma: "es",
          permisos: []
        }
      })
      expect((await pending).success).toBe(true)
      expect(await firstValueFrom(current)).toMatchObject({
        success: true,
        data: { name: "Fake Name", email: "returned@example.test", role: "Operaciones" }
      })
      auth.logout()
      expect(await firstValueFrom(current)).toMatchObject({ success: false })
      http
        .expectOne("http://localhost:8080/api/auth/logout")
        .flush(null, { status: 204, statusText: "OK" })
      http.expectNone(() => true)
      expect(read).toHaveBeenCalled()
      expect(write).toHaveBeenCalled()
      expect(read.mock.calls.some(([key]) => key === "authenticated")).toBe(false)
    } finally {
      auth.logout()
      read.mockRestore()
      write.mockRestore()
      localStorage.removeItem("authenticated")
    }
  })

  it("retains delayed legacy demo validation and domain failure Results", async () => {
    const users = TestBed.inject(UserInMemorySource)
    const roles = TestBed.inject(RoleInMemorySource)
    const customers = TestBed.inject(CUSTOMER_REPOSITORY)
    await cancelBeforeBoundary(users.updateUserStatusById(99, true), 250)
    await cancelBeforeBoundary(users.updateUserById(99, userInput), 250)
    await cancelBeforeBoundary(roles.deleteRoleById(99), 250)
    expect(await settle(users.updateUserById(99, userInput))).toMatchObject({
      success: false,
      error: { code: "USER_NOT_FOUND" }
    })
    expect(await settle(roles.deleteRoleById(99))).toMatchObject({
      success: false,
      error: { code: "ROLE_NOT_FOUND" }
    })
    expect(await settle(customers.delete(404))).toMatchObject({
      success: false,
      error: { code: "CUSTOMER_NOT_FOUND" }
    })
  })

  it("retains legacy demo role assignment validation, including inactive users", async () => {
    TestBed.overrideProvider(USER_REPOSITORY, {
      useFactory: () => TestBed.inject(UserInMemorySource)
    })
    const roles = TestBed.inject(RoleInMemorySource)
    const users = TestBed.inject(UserInMemorySource)
    await settle(roles.createRole(roleInput))
    const deletion = roles.deleteRoleById(6)
    await settle(users.createUser({ ...userInput, roleId: 6 }))
    expect(await settle(deletion)).toMatchObject({ success: false, error: { code: "ROLE_IN_USE" } })
    await settle(users.deleteUserById(49))
    expect(await settle(deletion)).toMatchObject({ success: true })
  })
})
