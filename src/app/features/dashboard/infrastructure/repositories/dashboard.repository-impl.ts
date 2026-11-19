import { inject, Injectable } from "@angular/core"
import { DashboardRepository } from "../../domain/repositories/dashboard.repository"
import { DashboardHttpSource } from "../source/dashboard-http.source"

@Injectable({ providedIn: "root" })
export class DashboardRepositoryImpl implements DashboardRepository {
  private readonly source = inject(DashboardHttpSource)

  getDashboard: DashboardRepository["getDashboard"] = params => this.source.getDashboard(params)
}
