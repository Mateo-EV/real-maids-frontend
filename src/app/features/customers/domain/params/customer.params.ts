import { CustomerType } from "../entities/customer.entity"

/**
 * Portal account intent shared by customer create/update. The tri-state is load-bearing and must
 * never collapse: `createAccount` **absent** leaves the account untouched, `true` creates it or
 * reactivates a deactivated row (both require `password` and a customer email) and `false` retires
 * an existing active account. `password` only travels with `true`; the backend rejects the pair
 * `password` + absent/`false` as `errores.passwordSoloConCuenta`.
 */
export interface CustomerAccountRequest {
  readonly createAccount?: boolean
  readonly password?: string | null
}

/** Confirmed ClienteRequest fields; metadata and account linking are separate. */
export interface CreateCustomerParams extends CustomerAccountRequest {
  readonly name: string
  readonly type: CustomerType
  readonly email: string | null
  readonly phone: string | null
}

export interface UpdateCustomerParams extends CustomerAccountRequest {
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

/**
 * WP10 T7 / S2 — own-profile update of the customer portal (`PUT /api/clientes/me`).
 *
 * The documented endpoint accepts **only** these two fields. The identity, the customer type, the
 * active flag, the email and every account field (`crearCuenta`/`password`) are staff-only: the
 * backend rejects them with `400` naming the field, and the sign-in email stays read-only because it
 * is shared with the account row. This type is therefore the whole contract — nothing else may
 * travel, and carrying an extra key is a transport error, not a silent drop.
 */
export interface UpdateOwnProfileParams {
  readonly name: string
  readonly phone: string | null
}

export interface SetCustomerStatusParams {
  readonly customerId: number
  readonly isActive: boolean
}
