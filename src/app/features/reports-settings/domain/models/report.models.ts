/** English projections of ReporteDtos, not additional SQL entities. */
export interface ReportType {
  type: string
  title: string
  description: string
}

export interface ReportTable {
  type: string
  title: string
  from: string
  to: string
  generatedAt: Date
  columns: string[]
  rows: unknown[][]
}

/** API supplies actor display text, not id_usuario; never fabricate a user ID. */
export interface GeneratedReportSummary {
  id: number
  type: string
  format: string
  parameters: string | null
  userName: string
  generatedAt: Date
}

export interface DailyServices {
  date: string
  services: number
}

export interface StaffWorkload {
  staffId: number
  name: string
  services: number
  hours: string
}

export interface CurrentSituation {
  ordersByStatus: Record<string, number>
  servicesToday: number
  servicesNext7Days: number
  unscheduledOrders: number
  pendingRequests: number
  openSupportCases: number
  servicesByDay: DailyServices[]
  workloadNext7Days: StaffWorkload[]
}

export interface PeriodActivity {
  from: string
  to: string
  registeredRequests: number
  createdOrders: number
  completedOrders: number
  cancelledOrders: number
  completionRate: string | null
  completedAmount: string
  complaints: number
}

export interface DashboardSnapshot {
  generatedAt: Date
  current: CurrentSituation
  period: PeriodActivity
}
