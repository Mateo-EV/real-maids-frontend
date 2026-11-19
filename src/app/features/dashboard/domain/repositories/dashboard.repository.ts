import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { DashboardError } from "../errors/dashboard.error"
import { DashboardView } from "../models/dashboard-views"
import { DashboardParams } from "../params/dashboard.params"

export interface DashboardRepository {
  /** Read-only confirmed controller operation; `GET /api/dashboard?desde&hasta`. */
  getDashboard(params: DashboardParams): Observable<Result<DashboardView, DashboardError>>
}

export const DASHBOARD_REPOSITORY = new InjectionToken<DashboardRepository>("dashboard.repository")
