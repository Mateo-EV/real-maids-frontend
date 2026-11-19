import { inject, Injectable } from "@angular/core"
import { Observable, of } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { ReportsSettingsError } from "../../domain/errors/reports-settings.error"
import { ReportsSettingsRepository } from "../../domain/repositories/reports-settings.repository"
import { ReportsHttpSource } from "../source/reports-http.source"

/** Kept local: an unwired operation answers with its documented refusal and no request. */
const unsupported = (): Observable<Result<never, ReportsSettingsError>> =>
  of(Result.failure(new ReportsSettingsError("UNSUPPORTED")))

/**
 * Infrastructure implementation of the area J contract. Only the confirmed, wired read
 * operations delegate to the HTTP source; CSV export (W7) and the proposed KPI / public
 * parameter / migration operations stay refused rather than inventing endpoints.
 */
@Injectable({ providedIn: "root" })
export class ReportsSettingsRepositoryImpl implements ReportsSettingsRepository {
  private readonly source = inject(ReportsHttpSource)

  getReportTypes: ReportsSettingsRepository["getReportTypes"] = () => this.source.getReportTypes()

  generateReport: ReportsSettingsRepository["generateReport"] = params =>
    this.source.generateReport(params)

  getGeneratedReports: ReportsSettingsRepository["getGeneratedReports"] = query =>
    this.source.getGeneratedReports(query)

  // CSV bytes are a later slice (W7); the dashboard is owned by the dashboard feature.
  exportReportCsv: ReportsSettingsRepository["exportReportCsv"] = unsupported
  getDashboard: ReportsSettingsRepository["getDashboard"] = unsupported

  // Proposed schema-backed operations: no endpoint exists, so nothing is dispatched.
  getKpiDefinitions: ReportsSettingsRepository["getKpiDefinitions"] = unsupported
  createKpiDefinition: ReportsSettingsRepository["createKpiDefinition"] = unsupported
  updateKpiDefinition: ReportsSettingsRepository["updateKpiDefinition"] = unsupported
  getKpiMeasurements: ReportsSettingsRepository["getKpiMeasurements"] = unsupported
  getPublicParameters: ReportsSettingsRepository["getPublicParameters"] = unsupported
  getMigrationHistory: ReportsSettingsRepository["getMigrationHistory"] = unsupported
}
