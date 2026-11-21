import { CustomerType } from "../entities/customer.entity"
import { CustomerAccountRequest } from "./customer.params"

/** Confirmed acquisition writes; identities and registration metadata are server-owned. */
export interface CreateLeadOriginParams {
  readonly name: string
  readonly description: string | null
  readonly isActive: boolean
}
export interface UpdateLeadOriginParams {
  readonly id: number
  readonly name: string
  readonly description: string | null
  readonly isActive: boolean
}
export interface CreateFunnelStageParams {
  readonly name: string
  readonly order: number
  readonly isFinal: boolean
}
export interface UpdateFunnelStageParams {
  readonly id: number
  readonly name: string
  readonly order: number
  readonly isFinal: boolean
}
export interface CreateLeadParams {
  readonly originId: number
  readonly stageId: number
  readonly name: string
  readonly email: string | null
  readonly phone: string | null
  readonly referenceAddress: string | null
  readonly observation: string | null
}
export interface UpdateLeadParams {
  readonly id: number
  readonly originId: number
  readonly stageId: number
  readonly name: string
  readonly email: string | null
  readonly phone: string | null
  readonly referenceAddress: string | null
  readonly observation: string | null
  /** Motivo del retroceso de etapa; obligatorio para el servidor cuando la etapa nueva es anterior. */
  readonly comentarioSeguimiento: string | null
}
/**
 * Server copies the lead's current profile and returns the linked customer on repeats. The account
 * keys keep the same wire tri-state as the customer writes: absent never touches the account, `true`
 * creates it with `password` and the email the server copies from the prospect, `false` means no
 * account. Conversion alone never creates one.
 */
export interface ConvertLeadParams extends CustomerAccountRequest {
  readonly leadId: number
  readonly type: CustomerType
}

export interface CreateLeadFollowUpParams {
  readonly leadId: number
  readonly stageId: number
  readonly comment: string | null
}
