import { Lang } from "@/app/features/users/domain/entities/user.entity"

/**
 * `POST /api/usuarios` creates the customer row in the same transaction only when `idRol` is the
 * backend's CLIENTE role, matched by exact name (`CuentaClienteService.ROL_CLIENTE`). That role is
 * identity, never an ACL: no permission is inferred from it.
 */
export const CUSTOMER_ROLE_NAME = "CLIENTE"

/**
 * Values admitted by the backend `chk_cliente_tipo` constraint for the customer row created with a
 * CLIENTE account. Mirroring them avoids a round trip that would answer 400.
 */
export const CUSTOMER_TYPES = ["residencial", "comercial"] as const
export type CustomerType = (typeof CUSTOMER_TYPES)[number]

export function isCustomerType(value: unknown): value is CustomerType {
  return typeof value === "string" && (CUSTOMER_TYPES as readonly string[]).includes(value)
}

export interface CreateUserParams {
  readonly name: string
  readonly email: string
  readonly password: string
  readonly lang: Lang
  readonly isActive: boolean
  readonly roleId: number
  // FICTITIOUS DEMO DATA only: initialization metadata, not real authentication activity.
  // Omitted/null means never accessed. TODO integration: use confirmed backend profile metadata.
  readonly lastAccess?: Date | null
  /**
   * Account-only data: only a CLIENTE account creation sends it, and it is what makes the backend
   * create the customer row. The type is required there; the phone stays optional.
   */
  readonly customerType?: CustomerType
  readonly phone?: string
}
