import { firstValueFrom } from "rxjs"
import { describe, expect, it } from "vitest"
import { Customer } from "../../domain/entities/customer.entity"
import { CustomerInMemorySource } from "./customer-in-memory.source"

describe("CustomerInMemorySource", () => {
  it("returns the demo catalog", async () => {
    const source = new CustomerInMemorySource()

    const result = await firstValueFrom(source.findAll())

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      expect(result.data[0]?.name).toBe("María López")
    }
  })

  it("returns a customer by identifier and reports missing customers", async () => {
    const source = new CustomerInMemorySource()

    const customerResult = await firstValueFrom(source.findById("customer-001"))
    const missingResult = await firstValueFrom(source.findById("customer-404"))

    expect(customerResult).toMatchObject({ success: true, data: { id: "customer-001" } })
    expect(missingResult).toMatchObject({
      success: false,
      error: { code: "CUSTOMER_NOT_FOUND" }
    })
  })

  it("creates a customer with a generated ID that is available to subsequent reads", async () => {
    const source = new CustomerInMemorySource()

    const createResult = await firstValueFrom(
      source.create({
        name: "Ana Torres",
        email: "ana.torres@example.com",
        phone: "+1 555 010 1003"
      })
    )

    expect(createResult).toMatchObject({
      success: true,
      data: {
        id: "customer-003",
        name: "Ana Torres",
        email: "ana.torres@example.com"
      }
    })
    if (!createResult.success) return

    const [customerResult, catalogResult] = await Promise.all([
      firstValueFrom(source.findById(createResult.data.id)),
      firstValueFrom(source.findAll())
    ])

    expect(customerResult).toMatchObject({ success: true, data: createResult.data })
    expect(catalogResult).toMatchObject({
      success: true,
      data: expect.arrayContaining([createResult.data])
    })
  })

  it("does not create, update, delete, or consume an ID until the returned observable is subscribed", async () => {
    const source = new CustomerInMemorySource()
    const create$ = source.create({ name: "Ana Torres", email: "ana.torres@example.com" })
    const update$ = source.update(new Customer("customer-001", "María Torres", "maria@example.com"))
    const delete$ = source.delete("customer-002")

    const beforeSubscription = await firstValueFrom(source.findAll())

    expect(beforeSubscription).toMatchObject({
      success: true,
      data: [
        { id: "customer-001", name: "María López" },
        { id: "customer-002", name: "Carlos Ramírez" }
      ]
    })
    expect((await firstValueFrom(create$)).success).toBe(true)
    expect((await firstValueFrom(update$)).success).toBe(true)
    expect((await firstValueFrom(delete$)).success).toBe(true)
  })

  it("replaces existing customers and deletes them from subsequent reads", async () => {
    const source = new CustomerInMemorySource()
    const updatedCustomer = new Customer(
      "customer-001",
      "María Torres",
      "maria.torres@example.com",
      "+1 555 010 1009"
    )

    const updateResult = await firstValueFrom(source.update(updatedCustomer))
    const readUpdatedResult = await firstValueFrom(source.findById(updatedCustomer.id))
    const deleteResult = await firstValueFrom(source.delete(updatedCustomer.id))
    const readDeletedResult = await firstValueFrom(source.findById(updatedCustomer.id))

    expect(updateResult).toMatchObject({ success: true, data: updatedCustomer })
    expect(readUpdatedResult).toMatchObject({ success: true, data: updatedCustomer })
    expect(deleteResult).toMatchObject({ success: true, data: undefined })
    expect(readDeletedResult).toMatchObject({
      success: false,
      error: { code: "CUSTOMER_NOT_FOUND" }
    })
  })

  it("reports missing identifiers for update and delete", async () => {
    const source = new CustomerInMemorySource()
    const missingCustomer = new Customer("customer-404", "Missing", "missing@example.com")

    const [updateResult, deleteResult] = await Promise.all([
      firstValueFrom(source.update(missingCustomer)),
      firstValueFrom(source.delete(missingCustomer.id))
    ])

    expect(updateResult).toMatchObject({ success: false, error: { code: "CUSTOMER_NOT_FOUND" } })
    expect(deleteResult).toMatchObject({ success: false, error: { code: "CUSTOMER_NOT_FOUND" } })
  })

  it("keeps mutations isolated to each source instance", async () => {
    const source = new CustomerInMemorySource()
    const independentSource = new CustomerInMemorySource()

    await firstValueFrom(source.delete("customer-001"))

    const [mutatedResult, independentResult] = await Promise.all([
      firstValueFrom(source.findById("customer-001")),
      firstValueFrom(independentSource.findById("customer-001"))
    ])

    expect(mutatedResult).toMatchObject({ success: false, error: { code: "CUSTOMER_NOT_FOUND" } })
    expect(independentResult).toMatchObject({ success: true, data: { id: "customer-001" } })
  })

  it("prevents external mutations from changing stored customers or another instance", async () => {
    const source = new CustomerInMemorySource()
    const independentSource = new CustomerInMemorySource()
    const updateInput = new Customer("customer-001", "María Torres", "maria.torres@example.com")

    const updateResult = await firstValueFrom(source.update(updateInput))
    Reflect.set(updateInput, "name", "Changed outside source")
    expect(updateResult.success).toBe(true)
    if (!updateResult.success) return
    expect(Reflect.set(updateResult.data, "name", "Changed through result")).toBe(false)

    const [storedResult, independentResult] = await Promise.all([
      firstValueFrom(source.findById("customer-001")),
      firstValueFrom(independentSource.findById("customer-001"))
    ])

    expect(storedResult).toMatchObject({ success: true, data: { name: "María Torres" } })
    expect(independentResult).toMatchObject({ success: true, data: { name: "María López" } })
  })
})
