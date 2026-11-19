import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { NgIcon, provideIcons } from "@ng-icons/core"
import {
  lucideActivity,
  lucideCalendarDays,
  lucideClipboardList,
  lucideClock
} from "@ng-icons/lucide"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmCardImports } from "@spartan-ng/helm/card"
import { Subject, switchMap } from "rxjs"
import {
  CatalogFilterDate,
  CatalogFilters
} from "@/app/shared/components/catalog-filters/catalog-filters"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { DashboardErrorCode } from "../../../domain/errors/dashboard.error"
import { ORDER_STATE_CODES, OrderStateCode } from "../../../domain/models/dashboard-views"
import { DashboardParams, normalizeDashboardParams } from "../../../domain/params/dashboard.params"
import { DashboardStore } from "../../state/dashboard.store"

/** One supplied figure, printed literally: counts are formatted by nobody. */
interface DashboardMetric {
  readonly key: string
  readonly label: string
  readonly value: string
  readonly detail: string
  readonly tone: "navy" | "amber" | "blue" | "green"
  readonly icon: string
}

interface OrderStateCount {
  readonly code: OrderStateCode
  readonly total: number
}

interface ReadRequest {
  readonly params: DashboardParams
  readonly force: boolean
}

/** One message per closed error code: a 403 is a permission error, never an empty board. */
const errorMessages: Record<DashboardErrorCode, string> = {
  VALIDATION: "La ventana de fechas no es válida. Revisá las fechas y volvé a intentar.",
  UNAUTHENTICATED: "Tu sesión no está disponible. Iniciá sesión de nuevo para ver el panel.",
  FORBIDDEN:
    "No tenés permiso para ver el panel operativo. El backend exige la autoridad DASHBOARD_LEER.",
  UNAVAILABLE: "No se pudo contactar al servidor. Volvé a intentar cuando esté disponible.",
  INVALID_RESPONSE: "El servidor devolvió una respuesta inesperada para el panel.",
  UNEXPECTED: "Ocurrió un error inesperado al leer el panel."
}

const invalidWindowMessage =
  "La ventana elegida no es válida: usá fechas reales y una fecha desde que no sea posterior a la hasta."

/**
 * P02 dashboard consumer (W4, S2, S7, S8). Read-only: it renders the supplied server
 * aggregates, prints counts/amounts/rate verbatim, keeps a verified board visible through a
 * failed or in-flight revalidation, and reports a 403 as a permission error. Every figure
 * belongs to the window the server returned, so a typed window is never used as a label.
 *
 * Exactly one read per entry/`params` change (S6): the component subscribes once, to one
 * `switchMap` over the request stream, and the store keeps no cross-visit cache, so mounting
 * the page is one read and each accepted window change is exactly one more. Nothing reads the
 * store from the template in a way that resubscribes, and no polling/automatic retry exists.
 */
@Component({
  selector: "app-dashboard-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogFilters, CatalogFrame, HlmButtonImports, HlmCardImports, NgIcon],
  providers: [
    provideIcons({ lucideActivity, lucideCalendarDays, lucideClipboardList, lucideClock })
  ],
  templateUrl: "./dashboard-page.html"
})
export class DashboardPage {
  private readonly store = inject(DashboardStore)
  private readonly destroyRef = inject(DestroyRef)
  /** The single subscription owner: every read of this page flows through it. */
  private readonly reads = new Subject<ReadRequest>()

  readonly model = signal<DashboardParams>({})
  readonly windowError = signal("")
  readonly view = computed(() => this.store.result())
  readonly loading = computed(() => this.store.loading())
  readonly refreshing = computed(() => this.store.refreshing())
  readonly busy = computed(() => this.loading() || this.refreshing())
  readonly errorMessage = computed(() => {
    const code = this.store.error()?.code
    return code ? errorMessages[code] : ""
  })
  readonly generatedText = computed(() => this.view()?.generatedAt.toISOString() ?? "")
  readonly filterDates = computed<readonly CatalogFilterDate[]>(() => [
    { id: "dashboard-from", label: "Desde", value: this.model().fromDate ?? "" },
    { id: "dashboard-to", label: "Hasta", value: this.model().toDate ?? "" }
  ])
  /** Only the states the backend reported; absent states are never invented as zero. */
  readonly orderStates = computed<readonly OrderStateCount[]>(() => {
    const states = this.view()?.current.ordersByState
    if (!states) return []
    return ORDER_STATE_CODES.flatMap(code => {
      const total = states[code]
      return total === undefined ? [] : [{ code, total }]
    })
  })
  readonly currentMetrics = computed<readonly DashboardMetric[]>(() => {
    const current = this.view()?.current
    if (!current) return []
    return [
      {
        key: "services-today",
        label: "Servicios hoy",
        value: String(current.servicesToday),
        detail: "Agenda del día",
        tone: "navy",
        icon: "lucideCalendarDays"
      },
      {
        key: "services-next-7",
        label: "Servicios próximos 7 días",
        value: String(current.servicesNext7Days),
        detail: "Ventana de siete días",
        tone: "blue",
        icon: "lucideCalendarDays"
      },
      {
        key: "unscheduled-orders",
        label: "Órdenes sin programar",
        value: String(current.unscheduledOrders),
        detail: "Todavía sin turno",
        tone: "amber",
        icon: "lucideClock"
      },
      {
        key: "requests-pending",
        label: "Solicitudes por atender",
        value: String(current.requestsPending),
        detail: "Registradas",
        tone: "navy",
        icon: "lucideClipboardList"
      },
      {
        key: "open-support",
        label: "Atenciones abiertas",
        value: String(current.openSupportRequests),
        detail: "Soporte al cliente",
        tone: "green",
        icon: "lucideActivity"
      }
    ]
  })
  /** Amounts and the compliance rate are supplied text: no arithmetic, no rounding. */
  readonly periodMetrics = computed<readonly DashboardMetric[]>(() => {
    const period = this.view()?.period
    if (!period) return []
    return [
      {
        key: "requests-registered",
        label: "Solicitudes registradas",
        value: String(period.requestsRegistered),
        detail: "En el período devuelto",
        tone: "navy",
        icon: "lucideClipboardList"
      },
      {
        key: "orders-created",
        label: "Órdenes creadas",
        value: String(period.ordersCreated),
        detail: "En el período devuelto",
        tone: "blue",
        icon: "lucideCalendarDays"
      },
      {
        key: "orders-completed",
        label: "Órdenes completadas",
        value: String(period.ordersCompleted),
        detail: "En el período devuelto",
        tone: "green",
        icon: "lucideActivity"
      },
      {
        key: "orders-cancelled",
        label: "Órdenes canceladas",
        value: String(period.ordersCancelled),
        detail: "En el período devuelto",
        tone: "amber",
        icon: "lucideClock"
      },
      {
        key: "compliance-rate",
        label: "Tasa de cumplimiento",
        value: period.complianceRate ?? "—",
        detail:
          period.complianceRate === null
            ? "No hubo cierres en el período"
            : "Valor suministrado por el servidor",
        tone: "green",
        icon: "lucideActivity"
      },
      {
        key: "completed-amount",
        label: "Monto completado",
        value: period.completedAmount,
        detail: "Importe suministrado por el servidor",
        tone: "navy",
        icon: "lucideActivity"
      },
      {
        key: "complaints",
        label: "Quejas",
        value: String(period.complaints),
        detail: "En el período devuelto",
        tone: "amber",
        icon: "lucideClipboardList"
      }
    ]
  })

  constructor() {
    // One subscription for the whole page lifetime: `switchMap` keeps one read in flight and
    // a superseded window releases the previous one. No template or change detection reads.
    this.reads
      .pipe(
        switchMap(request => this.store.observe(request.params, request.force)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    // One read per entry: mounting the page dispatches the default (server) window once.
    this.reads.next({ params: this.model(), force: false })
  }

  /** S7: an unusable typed window dispatches nothing and keeps the verified board. */
  setDate(change: { id: string; value: string }): void {
    if (this.destroyRef.destroyed) return
    const patch =
      change.id === "dashboard-from"
        ? { fromDate: change.value }
        : change.id === "dashboard-to"
          ? { toDate: change.value }
          : undefined
    if (!patch) return
    const next: DashboardParams = { ...this.model(), ...patch }
    const window = normalizeDashboardParams(next)
    if (window === undefined) {
      this.model.set(next)
      this.windowError.set(invalidWindowMessage)
      return
    }
    this.windowError.set("")
    this.model.set(window)
    this.reads.next({ params: window, force: false })
  }

  /** The only way to re-read (S6): no polling and no automatic retry. */
  refresh(): void {
    if (this.destroyRef.destroyed || this.busy()) return
    this.reads.next({ params: this.model(), force: true })
  }
}
