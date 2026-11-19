import { isPlatformBrowser } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { Result } from "@/app/shared/utils/result"
import { DashboardError } from "../../domain/errors/dashboard.error"
import { DashboardView } from "../../domain/models/dashboard-views"
import { DashboardParams } from "../../domain/params/dashboard.params"
import {
  capturedParams,
  dashboardError,
  dashboardQuery,
  dashboardView,
  failure
} from "./dashboard-http.validation"

@Injectable({ providedIn: "root" })
export class DashboardHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private readonly url = `${this.origin}/api/dashboard`

  // Cold and SSR-safe: no request is dispatched without a browser and a valid origin.
  private dispatch<T>(send: () => Observable<T>): Observable<Result<T, DashboardError>> {
    return defer(() => {
      if (!this.browser || !this.origin) return of(Result.failure(failure("UNAVAILABLE")))
      return defer(send).pipe(
        map(value => Result.success(value)),
        catchError((error: unknown) => of(Result.failure(dashboardError(error))))
      )
    })
  }

  getDashboard(params: DashboardParams = {}): Observable<Result<DashboardView, DashboardError>> {
    // Call-time capture: an unusable window fails as VALIDATION and dispatches nothing.
    const captured = capturedParams(params)
    return this.dispatch(() => {
      if (!captured) throw failure("VALIDATION")
      return this.http
        .get<unknown>(this.url, { params: dashboardQuery(captured), transferCache: false })
        .pipe(map(value => dashboardView(value)))
    })
  }
}
