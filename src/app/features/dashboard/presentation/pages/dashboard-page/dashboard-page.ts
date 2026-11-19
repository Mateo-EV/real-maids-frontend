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
import { Subject, switchMap, tap } from "rxjs"
import {
  CatalogFilterDate,
  CatalogFilters
} from "@/app/shared/components/catalog-filters/catalog-filters"
import { DashboardBar, DashboardBars } from "../../components/dashboard-bars/dashboard-bars"
import {
  DashboardColumn,
  DashboardColumns
} from "../../components/dashboard-columns/dashboard-columns"
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
  imports: [
    CatalogFilters,
    DashboardBars,
    DashboardColumns,
    HlmButtonImports,
    HlmCardImports,
    NgIcon
  ],
  providers: [
    provideIcons({ lucideActivity, lucideCalendarDays, lucideClipboardList, lucideClock })
  ],
  templateUrl: "./dashboard-page.html",
  styleUrl: "./dashboard-page.css"
})
export class DashboardPage {
  private readonly store = inject(DashboardStore)
  private readonly destroyRef = inject(DestroyRef)
  /** The single subscription owner: every read of this page flows through it. */
  private readonly reads = new Subject<ReadRequest>()

  readonly model = signal<DashboardParams>({})
  /**
   * The window actually requested, which is not the same thing as what the controls show: a
   * prefilled control displays the returned window while the entry it belongs to was asked
   * without parameters. Keeping them apart stops a refresh from looking like a new window.
   */
  private readonly requested = signal<DashboardParams>({})
  /**
   * Once the operator edits a date, the returned window stops rewriting the controls: the
   * typed values belong to the user, and only the server period label follows the response.
   */
  private readonly windowEdited = signal(false)
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
  /** The supplied counts as bars: the label and the figure are text, the bar is decoration. */
  readonly orderStateBars = computed<readonly DashboardBar[]>(() =>
    this.orderStates().map(state => ({
      key: state.code,
      label: state.code,
      value: state.total,
      valueText: String(state.total)
    }))
  )
  /** Supplied calendar days, printed literally: no instant, no browser timezone, no re-sorting. */
  readonly dailyColumns = computed<readonly DashboardColumn[]>(() =>
    (this.view()?.current.servicesPerDay ?? []).map(point => ({
      key: point.date,
      axisLabel: axisDay(point.date),
      accessibleLabel: `${point.date}: ${point.services} servicios`,
      value: point.services,
      valueText: String(point.services)
    }))
  )
  readonly staffBars = computed<readonly DashboardBar[]>(() =>
    (this.view()?.current.next7DaysLoad ?? []).map(load => ({
      key: String(load.staffId),
      label: load.name,
      value: load.services,
      valueText: String(load.services),
      detail: `${load.hours} h`
    }))
  )
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
        detail: "",
        tone: "navy",
        icon: "lucideClipboardList"
      },
      {
        key: "orders-created",
        label: "Órdenes creadas",
        value: String(period.ordersCreated),
        detail: "",
        tone: "blue",
        icon: "lucideCalendarDays"
      },
      {
        key: "orders-completed",
        label: "Órdenes completadas",
        value: String(period.ordersCompleted),
        detail: "",
        tone: "green",
        icon: "lucideActivity"
      },
      {
        key: "orders-cancelled",
        label: "Órdenes canceladas",
        value: String(period.ordersCancelled),
        detail: "",
        tone: "amber",
        icon: "lucideClock"
      },
      {
        key: "compliance-rate",
        label: "Tasa de cumplimiento",
        value: period.complianceRate ?? "—",
        detail: period.complianceRate === null ? "No hubo cierres en el período" : "",
        tone: "green",
        icon: "lucideActivity"
      },
      {
        key: "completed-amount",
        label: "Monto completado",
        value: period.completedAmount,
        detail: "",
        tone: "navy",
        icon: "lucideActivity"
      },
      {
        key: "complaints",
        label: "Quejas",
        value: String(period.complaints),
        detail: "",
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
        tap(read => this.adoptServerWindow(read.success ? read.data.period : null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    // One read per entry: mounting the page dispatches the default (server) window once.
    this.reads.next({ params: this.requested(), force: false })
  }

  /**
   * The server owns its default window (last 30 days), so the controls start by showing the
   * window it returned instead of four empty placeholders. Presentation only: assigning the
   * model opens no read, and an edited window is never overwritten.
   */
  private adoptServerWindow(period: { fromDate: string; toDate: string } | null | undefined): void {
    if (this.windowEdited() || !period) return
    const current = this.model()
    if (current.fromDate === period.fromDate && current.toDate === period.toDate) return
    this.model.set({ fromDate: period.fromDate, toDate: period.toDate })
  }

  /** S7: an unusable typed window dispatches nothing and keeps the verified board. */
  setDate(change: { id: string; value: string }): void {
    if (this.destroyRef.destroyed) return
    this.windowEdited.set(true)
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
    this.requested.set(window)
    this.reads.next({ params: window, force: false })
  }

  /** The only way to re-read (S6): no polling and no automatic retry. */
  refresh(): void {
    if (this.destroyRef.destroyed || this.busy()) return
    this.reads.next({ params: this.requested(), force: true })
  }
}

/**
 * Compact axis text for a supplied `YYYY-MM-DD` day. Pure string slicing: the day is never
 * turned into an instant, so the axis cannot drift with the browser or an operational timezone.
 */
function axisDay(day: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(day)
  return match ? `${match[2]}/${match[1]}` : day
}
