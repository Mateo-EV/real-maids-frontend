import { firstValueFrom } from "rxjs"
import { describe, expect, it } from "vitest"
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
})
