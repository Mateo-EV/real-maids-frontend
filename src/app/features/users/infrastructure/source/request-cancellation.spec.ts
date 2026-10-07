import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appConfig } from "@/app/core/config/app.config"
import { AUTH_REPOSITORY } from "@/app/features/auth/domain/repositories/auth.repository"
import { CUSTOMER_REPOSITORY } from "@/app/features/customers/domain/repositories/customer.repository"
import { AuthInMemorySource } from "@/app/features/auth/infrastructure/source/auth-in-memory.source"
import { CustomerInMemorySource } from "@/app/features/customers/infrastructure/source/customer-in-memory.source"
import { Customer } from "@/app/features/customers/domain/entities/customer.entity"
import { USER_REPOSITORY } from "../../domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "../../domain/repositories/role.repository"
import { Lang } from "../../domain/entities/user.entity"
import { UserInMemorySource } from "./user-in-memory.source"
import { RoleInMemorySource } from "./role-in-memory.source"

import { AUDIT_LOG_REPOSITORY } from "../../domain/repositories/audit-log.repository"

const userInput = {
  name: "Demo",
  age: 30,
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

describe("Cancellable in-memory execution boundaries", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    TestBed.configureTestingModule({ providers: appConfig.providers })
  })
  afterEach(() => vi.useRealTimers())

  it.each([1, 0])("cancels audit limit=%s without results or errors before 250ms", async limit => {
    const repository = TestBed.inject(AUDIT_LOG_REPOSITORY)
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
  })

  it("binds every domain repository to an implementation distinct from its shared source", () => {
    expect(TestBed.inject(AUTH_REPOSITORY)).not.toBe(TestBed.inject(AuthInMemorySource))
    expect(TestBed.inject(CUSTOMER_REPOSITORY)).not.toBe(TestBed.inject(CustomerInMemorySource))
    expect(TestBed.inject(USER_REPOSITORY)).not.toBe(TestBed.inject(UserInMemorySource))
    expect(TestBed.inject(ROLE_REPOSITORY)).not.toBe(TestBed.inject(RoleInMemorySource))
  })

  for (const valid of [true, false]) {
    it(`cancels ${valid ? "valid" : "invalid"} login without storage effects`, async () => {
      localStorage.setItem("authenticated", "true")
      const write = vi.spyOn(Storage.prototype, "setItem")
      try {
        await cancelBeforeBoundary(
          TestBed.inject(AUTH_REPOSITORY).login({
            email: "riojamatthew@gmail.com",
            password: valid ? "demo2026" : "wrong"
          }),
          650
        )
        expect(write).not.toHaveBeenCalled()
        expect(localStorage.getItem("authenticated")).toBe("true")
      } finally {
        write.mockRestore()
      }
    })
  }

  it("cancels customer create/update/delete without mutations or ID allocation", async () => {
    const repository = TestBed.inject(CUSTOMER_REPOSITORY)
    const source = TestBed.inject(CustomerInMemorySource)
    const before = await settle(source.findAll())
    await cancelBeforeBoundary(
      repository.create({ name: "Cancelled", email: "cancelled@example.com" }),
      150
    )
    await cancelBeforeBoundary(
      repository.update(new Customer("customer-001", "Cancelled", "cancelled@example.com")),
      150
    )
    await cancelBeforeBoundary(repository.delete("customer-002"), 150)
    expect(await settle(source.findAll())).toEqual(before)
    expect(
      await settle(repository.create({ name: "Completed", email: "completed@example.com" }))
    ).toMatchObject({ success: true, data: { id: "customer-003" } })
  })

  it("cancels user create/update/delete without mutations or ID allocation", async () => {
    const repository = TestBed.inject(USER_REPOSITORY)
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

  it("cancels role create/update/delete without mutations or ID allocation", async () => {
    const repository = TestBed.inject(ROLE_REPOSITORY)
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

  it("cancels role deletion during its pending reference query without deleting", async () => {
    const roles = TestBed.inject(ROLE_REPOSITORY)
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

  it("does not read auth storage until restoration executes, and cancellation prevents reads", async () => {
    const auth = TestBed.inject(AUTH_REPOSITORY)
    const read = vi.spyOn(Storage.prototype, "getItem")
    try {
      await cancelBeforeBoundary(auth.me(), 250)
      expect(read).not.toHaveBeenCalled()
      const restoration = auth.me()
      localStorage.setItem("authenticated", "true")
      expect(await settle(restoration)).toMatchObject({ success: true })
    } finally {
      read.mockRestore()
    }
  })

  it("delays missing-record validation and preserves domain failure Results", async () => {
    const users = TestBed.inject(USER_REPOSITORY)
    const roles = TestBed.inject(ROLE_REPOSITORY)
    const customers = TestBed.inject(CUSTOMER_REPOSITORY)
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
    expect(await settle(customers.delete("missing"))).toMatchObject({
      success: false,
      error: { code: "CUSTOMER_NOT_FOUND" }
    })
  })

  it("validates role assignments at execution, including inactive users", async () => {
    const roles = TestBed.inject(ROLE_REPOSITORY)
    const users = TestBed.inject(USER_REPOSITORY)
    await settle(roles.createRole(roleInput))
    const deletion = roles.deleteRoleById(6)
    await settle(users.createUser({ ...userInput, roleId: 6 }))
    expect(await settle(deletion)).toMatchObject({ success: false, error: { code: "ROLE_IN_USE" } })
    await settle(users.deleteUserById(49))
    expect(await settle(deletion)).toMatchObject({ success: true })
  })
})
