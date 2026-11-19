// English projections of `DashboardResponse{generadoEn, actual, periodo}`, not
// substitutes for the backend aggregates. The wire state vocabulary is the
// backend's fixed `CodigoEstadoOrden` enum and there is no status catalog
// endpoint, so this closed set is the only accepted order-state vocabulary.
// Authorization (`DASHBOARD_LEER`) stays on the backend: a 403 is an error, not
// an empty dashboard.
export const ORDER_STATE_CODES = [
  "PENDIENTE",
  "PROGRAMADA",
  "EN_PROCESO",
  "COMPLETADA",
  "PAGADO",
  "CANCELADA"
] as const

export type OrderStateCode = (typeof ORDER_STATE_CODES)[number]

/** One point of the supplied daily service series; `date` stays a literal calendar day. */
export interface DailyServiceCount {
  date: string
  services: number
}

export interface CollaboratorLoad {
  staffId: number
  name: string
  services: number
  /** Supplied `BigDecimal` hours as canonical text; never recomputed here. */
  hours: string
}

export interface CurrentSituation {
  /** Only the codes the backend actually reported: absent states are never invented. */
  ordersByState: Readonly<Partial<Record<OrderStateCode, number>>>
  servicesToday: number
  servicesNext7Days: number
  unscheduledOrders: number
  requestsPending: number
  openSupportRequests: number
  servicesPerDay: DailyServiceCount[]
  next7DaysLoad: CollaboratorLoad[]
}

export interface PeriodActivity {
  fromDate: string
  toDate: string
  requestsRegistered: number
  ordersCreated: number
  ordersCompleted: number
  ordersCancelled: number
  /** Null when the period closed nothing; supplied text, never derived. */
  complianceRate: string | null
  /** Supplied `BigDecimal` amount as canonical text; no client arithmetic. */
  completedAmount: string
  complaints: number
}

export interface DashboardView {
  generatedAt: Date
  current: CurrentSituation
  period: PeriodActivity
}
