import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { KpiDefinition } from "../entities/kpi-definition.entity"
import { KpiMeasurement } from "../entities/kpi-measurement.entity"
import { SystemParameter } from "../entities/system-parameter.entity"
import { MigrationRecord } from "../entities/migration-record.entity"
import { ReportsSettingsError } from "../errors/reports-settings.error"
import {
  ReportType,
  ReportTable,
  GeneratedReportSummary,
  DashboardSnapshot
} from "../models/report.models"
import {
  ReportPeriodParams,
  GenerateReportParams,
  CreateKpiDefinitionParams,
  UpdateKpiDefinitionParams,
  KpiMeasurementQuery,
  PublicParameterQuery,
  MigrationHistoryQuery
} from "../params/reports-settings.params"

export interface ReportsSettingsRepository {
  // Confirmed controller operations; no implementation/provider is wired.
  getReportTypes(): Observable<Result<ReportType[], ReportsSettingsError>>
  generateReport(
    params: GenerateReportParams
  ): Observable<Result<ReportTable, ReportsSettingsError>>
  exportReportCsv(params: GenerateReportParams): Observable<Result<Blob, ReportsSettingsError>>
  getGeneratedReports(
    query: PaginationParams
  ): Observable<Result<PaginationResponse<GeneratedReportSummary>, ReportsSettingsError>>
  getDashboard(
    params: ReportPeriodParams
  ): Observable<Result<DashboardSnapshot, ReportsSettingsError>>

  // Proposed schema-backed operations, not available endpoints.
  getKpiDefinitions(): Observable<Result<KpiDefinition[], ReportsSettingsError>>
  createKpiDefinition(
    params: CreateKpiDefinitionParams
  ): Observable<Result<KpiDefinition, ReportsSettingsError>>
  updateKpiDefinition(
    id: number,
    params: UpdateKpiDefinitionParams
  ): Observable<Result<KpiDefinition, ReportsSettingsError>>
  getKpiMeasurements(
    kpiId: number,
    query: KpiMeasurementQuery
  ): Observable<Result<PaginationResponse<KpiMeasurement>, ReportsSettingsError>>
  getPublicParameters(
    query: PublicParameterQuery
  ): Observable<Result<SystemParameter[], ReportsSettingsError>>
  getMigrationHistory(
    query: MigrationHistoryQuery
  ): Observable<Result<PaginationResponse<MigrationRecord>, ReportsSettingsError>>
}

export const REPORTS_SETTINGS_REPOSITORY = new InjectionToken<ReportsSettingsRepository>(
  "reports-settings.repository"
)
