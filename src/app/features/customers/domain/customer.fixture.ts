import { Customer, CustomerType } from "./entities/customer.entity"
import { CreateCustomerParams } from "./params/customer.params"

/** Test fixtures only; never a backend response or production fallback. */
export const customerInput = (
  name: string,
  email: string | null = null,
  phone: string | null = null
): CreateCustomerParams => ({ name, type: CustomerType.RESIDENTIAL, email, phone })

export const customerFixture = (
  id: number,
  name: string,
  email: string | null = null,
  phone: string | null = null
): Customer =>
  Customer.create(
    id,
    name,
    null,
    CustomerType.RESIDENTIAL,
    email,
    phone,
    null,
    null,
    null,
    true,
    new Date("2026-01-01T00:00:00Z"),
    null,
    null,
    null
  )
