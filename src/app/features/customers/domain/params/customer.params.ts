import { CustomerType } from "../entities/customer.entity"

/** Confirmed ClienteRequest fields; metadata and account linking are separate. */
export interface CreateCustomerParams {
  readonly name: string
  readonly type: CustomerType
  readonly email: string | null
  readonly phone: string | null
}

export interface UpdateCustomerParams {
  readonly id: number
  readonly name: string
  readonly type: CustomerType
  readonly email: string | null
  readonly phone: string | null
}

export interface LinkCustomerAccountParams {
  readonly customerId: number
  readonly userId: number | null
}

export interface SetCustomerStatusParams {
  readonly customerId: number
  readonly isActive: boolean
}
