import { isPlatformBrowser } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { ReportsSettingsError } from "../../domain/errors/reports-settings.error"
import { GeneratedReportSummary, ReportTable, ReportType } from "../../domain/models/report.models"
import {
  GenerateReportParams,
  ReportHistoryQuery,
  normalizeGenerateReportParams
} from "../../domain/params/reports-settings.params"
import {
  capturedGenerate,
  failure,
  generatedReportPage,
  generateQuery,
  historyPagination,
  reportTable,
  reportTypes,
  reportsError
} from "./reports-http.validation"

/**
 * Confirmed read/adapter surface for area J reports (W6, S4, S5): the type catalog, the
 * paged generated-report history and the report table itself.
 *
 * Generating travels over `GET /api/reportes/{tipo}` but is an *effect*: the backend records
 * the report in the history. This source only ever dispatches it when a caller explicitly
 * asks for one, and it adds no retry, no revalidation and no eager read of its own.
 */
@Injectable({ providedIn: "root" })
export class ReportsHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private readonly reportsUrl = `${this.origin}/api/reportes`

  // Cold and SSR-safe: no request is dispatched without a browser and a valid origin.
  private dispatch<T>(send: () => Observable<T>): Observable<Result<T, ReportsSettingsError>> {
    return defer(() => {
      if (!this.browser || !this.origin) return of(Result.failure(failure("NETWORK")))
      return defer(send).pipe(
        map(value => Result.success(value)),
        catchError((error: unknown) => of(Result.failure(reportsError(error))))
      )
    })
  }

  getReportTypes(): Observable<Result<ReportType[], ReportsSettingsError>> {
    return this.dispatch(() =>
      this.http
        .get<unknown>(this.reportsUrl, { transferCache: false })
        .pipe(map(value => reportTypes(value)))
    )
  }

  getGeneratedReports(
    query: ReportHistoryQuery = {}
  ): Observable<Result<PaginationResponse<GeneratedReportSummary>, ReportsSettingsError>> {
    const snapshot: ReportHistoryQuery = { offset: query.offset, limit: query.limit }
    return this.dispatch(() => {
      const params = historyPagination(snapshot)
      return this.http
        .get<unknown>(`${this.reportsUrl}/generados`, { params, transferCache: false })
        .pipe(map(value => generatedReportPage(value, params)))
    })
  }

  /**
   * The one operation that changes backend state. It is documented as a `GET`, so it is
   * deliberately shaped like a write: caller-driven, never retried, never scheduled.
   */
  generateReport(
    params: GenerateReportParams
  ): Observable<Result<ReportTable, ReportsSettingsError>> {
    const captured = capturedGenerate(params)
    return this.dispatch(() => {
      const requested = normalizeGenerateReportParams(captured)
      if (!requested) throw failure("VALIDATION")
      const query = generateQuery(requested)
      return this.http
        .get<unknown>(`${this.reportsUrl}/${encodeURIComponent(requested.type)}`, {
          params: query,
          transferCache: false
        })
        .pipe(map(value => reportTable(value, requested)))
    })
  }
}
