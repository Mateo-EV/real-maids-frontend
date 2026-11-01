/** Proposed contact/preference capabilities. Owners are explicit repository arguments. */
export interface CreateCustomerContactParams {
  readonly name: string
  readonly position: string | null
  readonly email: string | null
  readonly phone: string | null
  readonly isPrimary: boolean
  readonly isActive: boolean
}
export interface UpdateCustomerContactParams {
  readonly id: number
  readonly name: string
  readonly position: string | null
  readonly email: string | null
  readonly phone: string | null
  readonly isPrimary: boolean
  readonly isActive: boolean
}
export interface CreateCustomerPreferenceParams {
  readonly propertyId: number | null
  readonly type: string
  readonly detail: string
  readonly isActive: boolean
}
export interface UpdateCustomerPreferenceParams {
  readonly id: number
  readonly propertyId: number | null
  readonly type: string
  readonly detail: string
  readonly isActive: boolean
}
