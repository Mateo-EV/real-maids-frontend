import { inject, Injectable } from "@angular/core"
import {
  GenerateReportParams,
  ReportHistoryQuery
} from "../../domain/params/reports-settings.params"
import { REPORTS_SETTINGS_REPOSITORY } from "../../domain/repositories/reports-settings.repository"

/** Stateless read: the authoritative catalog of valid report types. */
@Injectable({ providedIn: "root" })
export class ListReportTypesUseCase {
  private readonly repository = inject(REPORTS_SETTINGS_REPOSITORY)

  execute() {
    return this.repository.getReportTypes()
  }
}

/** Stateless read: one page of the generated-report history. This never generates. */
@Injectable({ providedIn: "root" })
export class ListGeneratedReportsUseCase {
  private readonly repository = inject(REPORTS_SETTINGS_REPOSITORY)

  execute(query: ReportHistoryQuery = {}) {
    return this.repository.getGeneratedReports(query)
  }
}

/**
 * Stateless action for the one operation with a side effect: the backend records the report
 * in the history. Callers dispatch it only from an explicit user action (S5).
 */
@Injectable({ providedIn: "root" })
export class GenerateReportUseCase {
  private readonly repository = inject(REPORTS_SETTINGS_REPOSITORY)

  execute(params: GenerateReportParams) {
    return this.repository.generateReport(params)
  }
}

/**
 * Stateless action for the CSV of a loaded report. Like the JSON generation it is a `GET` with
 * a side effect — the backend registers the download in the history — so it is only reachable
 * from an explicit user action and is never retried by this layer.
 */
@Injectable({ providedIn: "root" })
export class ExportReportCsvUseCase {
  private readonly repository = inject(REPORTS_SETTINGS_REPOSITORY)

  execute(params: GenerateReportParams) {
    return this.repository.exportReportCsv(params)
  }
}
