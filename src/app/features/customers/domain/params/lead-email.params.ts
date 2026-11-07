export interface CheckLeadEmailParams {
  email: string
  excludeLeadId?: number
}
export interface LeadEmailCheck {
  customerExists: boolean
  leadExists: boolean
}
