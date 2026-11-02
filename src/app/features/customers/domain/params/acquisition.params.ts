import { CustomerType } from "../entities/customer.entity"

/** Confirmed acquisition writes; identities and registration metadata are server-owned. */
export interface CreateProspectOriginParams {
  readonly name: string
  readonly description: string | null
  readonly isActive: boolean
}
export interface UpdateProspectOriginParams {
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
export interface CreateProspectParams {
  readonly originId: number
  readonly stageId: number
  readonly name: string
  readonly email: string | null
  readonly phone: string | null
  readonly referenceAddress: string | null
  readonly observation: string | null
}
export interface UpdateProspectParams {
  readonly id: number
  readonly originId: number
  readonly stageId: number
  readonly name: string
  readonly email: string | null
  readonly phone: string | null
  readonly referenceAddress: string | null
  readonly observation: string | null
}
/** Server copies the prospect's current profile; repeat returns the linked customer. */
export interface ConvertProspectParams {
  readonly prospectId: number
  readonly type: CustomerType
}

export interface CreateProspectFollowUpParams {
  readonly prospectId: number
  readonly stageId: number
  readonly comment: string | null
}
