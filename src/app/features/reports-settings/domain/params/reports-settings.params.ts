import { PaginationParams } from "@/app/shared/pagination/pagination.params"

/** Calendar dates; backend defines business timezone and default/max period. */
export interface ReportPeriodParams {
  from?: string
  to?: string
}

export interface GenerateReportParams extends ReportPeriodParams {
  type: string
}

export interface CreateKpiDefinitionParams {
  name: string
  description: string | null
  formula: string | null
  unit: string | null
  target: string | null
  frequency: string | null
  isActive: boolean
}

export interface UpdateKpiDefinitionParams {
  name?: string
  description?: string | null
  formula?: string | null
  unit?: string | null
  target?: string | null
  frequency?: string | null
  isActive?: boolean
}

export interface KpiMeasurementQuery extends PaginationParams {
  periodStart?: string
  periodEnd?: string
}

/** Read only. Server must allowlist public keys, never return raw configuration. */
export interface PublicParameterQuery {
  keys: readonly string[]
}

export interface MigrationHistoryQuery extends PaginationParams {
  entity?: string
  sourceSystem?: string
}
