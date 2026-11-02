import { firstValueFrom, Observable } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { customerFixture, customerInput } from "../../domain/customer.fixture"
import { CustomerType } from "../../domain/entities/customer.entity"
import { CustomerInMemorySource } from "./customer-in-memory.source"

describe("CustomerInMemorySource", () => {
  afterEach(() => vi.useRealTimers())

  it("returns the demo catalog", async () => {
    const result = await firstValueFrom(new CustomerInMemorySource().findAll())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      expect(result.data[0]?.name).toBe("María López")
    }
  })

  it("returns a customer by identifier and reports missing customers", async () => {
    const source = new CustomerInMemorySource()
    expect(await firstValueFrom(source.findById(1))).toMatchObject({
      success: true,
      data: { id: 1 }
    })
    expect(await firstValueFrom(source.findById(404))).toMatchObject({
      success: false,
      error: { code: "CUSTOMER_NOT_FOUND" }
    })
  })

  it("creates a customer with a generated ID that is available to subsequent reads", async () => {
    const source = new CustomerInMemorySource()
    const input = {
      ...customerInput("Ana Torres", "ana.torres@example.com", "+1 555 010 1003"),
      type: CustomerType.COMMERCIAL
    }
    const created = await firstValueFrom(source.create(input))
    expect(created).toMatchObject({
      success: true,
      data: {
        ...input,
        id: 3,
        userId: null,
        leadId: null,
        taxIdentification: null,
        systemOrigin: null,
        externalId: null,
        isActive: true,
        updatedAt: null,
        registeredByUserId: null
      }
    })
    if (!created.success) throw created.error
    expect(created.data.createdAt).toBeInstanceOf(Date)
    expect(await firstValueFrom(source.findById(created.data.id))).toEqual(created)
    const catalog = await firstValueFrom(source.findAll())
    expect(catalog).toMatchObject({ success: true, data: expect.arrayContaining([created.data]) })
  })

  it("does not create, update, delete, or consume an ID until the returned observable is subscribed", async () => {
    const source = new CustomerInMemorySource()
    const create$ = source.create(customerInput("Ana Torres", "ana.torres@example.com"))
    const update$ = source.update(customerFixture(1, "María Torres", "maria@example.com"))
    const delete$ = source.delete(2)
    expect(await firstValueFrom(source.findAll())).toMatchObject({
      success: true,
      data: [
        { id: 1, name: "María López" },
        { id: 2, name: "Carlos Ramírez" }
      ]
    })
    expect(await firstValueFrom(create$)).toMatchObject({ success: true, data: { id: 3 } })
    expect((await firstValueFrom(update$)).success).toBe(true)
    expect((await firstValueFrom(delete$)).success).toBe(true)
  })

  it("replaces existing customer profile fields and deletes them from subsequent reads", async () => {
    const source = new CustomerInMemorySource()
    const updated = customerFixture(
      1,
      "María Torres",
      "maria.torres@example.com",
      "+1 555 010 1009"
    )
    const result = await firstValueFrom(source.update(updated))
    expect(result).toMatchObject({
      success: true,
      data: {
        id: 1,
        name: updated.name,
        type: updated.type,
        email: updated.email,
        phone: updated.phone,
        createdAt: updated.createdAt,
        userId: null,
        leadId: null
      }
    })
    if (!result.success) throw result.error
    expect(result.data.updatedAt).toBeInstanceOf(Date)
    expect(await firstValueFrom(source.findById(1))).toEqual(result)
    expect(await firstValueFrom(source.delete(1))).toEqual({ success: true, data: undefined })
    expect(await firstValueFrom(source.findById(1))).toMatchObject({
      success: false,
      error: { code: "CUSTOMER_NOT_FOUND" }
    })
  })

  it("reports missing identifiers for update and delete", async () => {
    const source = new CustomerInMemorySource()
    const missing = customerFixture(404, "Missing", "missing@example.com")
    for (const result of await Promise.all([
      firstValueFrom(source.update(missing)),
      firstValueFrom(source.delete(404))
    ])) {
      expect(result).toMatchObject({ success: false, error: { code: "CUSTOMER_NOT_FOUND" } })
    }
  })

  it("keeps mutations isolated to each source instance", async () => {
    const source = new CustomerInMemorySource()
    const independent = new CustomerInMemorySource()
    await firstValueFrom(source.delete(1))
    expect(await firstValueFrom(source.findById(1))).toMatchObject({ success: false })
    expect(await firstValueFrom(independent.findById(1))).toMatchObject({
      success: true,
      data: { id: 1 }
    })
  })

  it("prevents external mutations and date changes from changing stored customers or another instance", async () => {
    const source = new CustomerInMemorySource()
    const independent = new CustomerInMemorySource()
    const input = customerFixture(1, "María Torres", null)
    const result = await firstValueFrom(source.update(input))
    Reflect.set(input, "name", "Changed outside source")
    input.createdAt.setFullYear(1900)
    expect(result.success).toBe(true)
    if (!result.success) throw result.error
    expect(Reflect.set(result.data, "name", "Changed through result")).toBe(false)
    result.data.createdAt.setFullYear(1901)
    result.data.updatedAt?.setFullYear(1902)
    const stored = await firstValueFrom(source.findById(1))
    expect(stored).toMatchObject({ success: true, data: { name: "María Torres", email: null } })
    if (!stored.success) throw stored.error
    expect(stored.data.createdAt.getUTCFullYear()).toBe(2026)
    expect(stored.data.updatedAt?.getUTCFullYear()).not.toBe(1902)
    expect(await firstValueFrom(independent.findById(1))).toMatchObject({
      success: true,
      data: { name: "María López" }
    })
  })

  it("cancels all mutations before latency and does not allocate cancelled or reused IDs", async () => {
    vi.useFakeTimers()
    const source = new CustomerInMemorySource()
    for (const request of [
      source.create(customerInput("Cancelled")),
      source.update(customerFixture(1, "Cancelled")),
      source.delete(2)
    ] as Observable<unknown>[]) {
      const next = vi.fn()
      const subscription = request.subscribe(next)
      await vi.advanceTimersByTimeAsync(149)
      expect(next).not.toHaveBeenCalled()
      subscription.unsubscribe()
      await vi.runAllTimersAsync()
      expect(next).not.toHaveBeenCalled()
    }
    const created = firstValueFrom(source.create(customerInput("Completed")))
    await vi.runAllTimersAsync()
    expect(await created).toMatchObject({
      success: true,
      data: { id: 3, email: null, phone: null }
    })
    const removed = firstValueFrom(source.delete(3))
    await vi.runAllTimersAsync()
    await removed
    const next = firstValueFrom(source.create(customerInput("Next")))
    await vi.runAllTimersAsync()
    expect(await next).toMatchObject({ success: true, data: { id: 4 } })
  })
})
