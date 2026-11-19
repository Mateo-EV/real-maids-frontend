import { inject, Injectable } from "@angular/core"
import { DashboardParams } from "../../domain/params/dashboard.params"
import { DASHBOARD_REPOSITORY } from "../../domain/repositories/dashboard.repository"

/** Stateless read action: one dashboard read for the requested (or default) window. */
@Injectable({ providedIn: "root" })
export class GetDashboardUseCase {
  private readonly repository = inject(DASHBOARD_REPOSITORY)

  execute(params: DashboardParams = {}) {
    return this.repository.getDashboard(params)
  }
}
