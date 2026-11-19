import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideChartColumn, lucideFileDown } from "@ng-icons/lucide"
import { HotToastService } from "@ngxpert/hot-toast"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { catchError, EMPTY, map, mergeMap, Subject, switchMap, take, tap } from "rxjs"
import {
  CatalogFilterDate,
  CatalogFilterSelect,
  CatalogFilters
} from "@/app/shared/components/catalog-filters/catalog-filters"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { NormalizedPagination } from "@/app/shared/pagination/pagination.params"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import {
  GeneratedReportSummary,
  ReportCsvFile,
  ReportTable,
  reportCellText
} from "../../../domain/models/report.models"
import {
  GenerateReportParams,
  ReportHistoryQuery,
  normalizeGenerateReportParams,
  normalizeReportHistoryQuery,
  normalizeReportPeriod,
  reportRequestKey
} from "../../../domain/params/reports-settings.params"
import { ReportsSettingsErrorCode } from "../../../domain/errors/reports-settings.error"
import { ReportCsvDownload } from "../../../infrastructure/export/report-csv-download"
import { ReportsStore } from "../../state/reports.store"

/** One message per closed error code: a 403 is a permission error, never an empty screen. */
const errorMessages: Record<ReportsSettingsErrorCode, string> = {
  VALIDATION: "El tipo o el período elegido no es válido. Revisalo y volvé a intentar.",
  UNAUTHENTICATED: "Tu sesión no está disponible. Iniciá sesión de nuevo para ver los reportes.",
  FORBIDDEN:
    "No tenés permiso para ver ni generar reportes. El backend exige la autoridad REPORTE_LEER.",
  NETWORK: "No se pudo contactar al servidor. Volvé a intentar cuando esté disponible.",
  NOT_FOUND: "El servidor no encontró el recurso solicitado.",
  CONFLICT: "Ya hay una generación en curso. Esperá a que termine antes de generar otra.",
  INVALID_RESPONSE: "El servidor devolvió una respuesta inesperada para el reporte.",
  UNEXPECTED: "Ocurrió un error inesperado al leer el reporte.",
  UNSUPPORTED: "El servidor no expone esta operación."
}

const invalidPeriodMessage =
  "El período elegido no es válido: usá fechas reales y una fecha desde que no sea posterior a la hasta."

/** Download-specific copy: a CONFLICT here means another download, never another generation. */
const downloadMessages: Partial<Record<ReportsSettingsErrorCode, string>> = {
  CONFLICT: "Ya hay una descarga en curso. Esperá a que termine antes de descargar de nuevo.",
  VALIDATION:
    "El reporte generado ya no corresponde al tipo y período elegidos. Volvé a generarlo antes de descargarlo.",
  UNSUPPORTED: "El navegador no pudo iniciar la descarga del CSV.",
  INVALID_RESPONSE: "El servidor devolvió un archivo que no se puede descargar como CSV.",
  UNEXPECTED: "El navegador no pudo iniciar la descarga del CSV."
}

const downloadMessage = (code: ReportsSettingsErrorCode): string =>
  downloadMessages[code] ?? errorMessages[code]

/**
 * A failed download is never reported as "nothing was registered": the server can register the
 * record and still fail on the way back, and a same-page retry would then duplicate the history.
 */
const downloadUnknownNote =
  "El resultado de la descarga es desconocido: el servidor pudo haber registrado el reporte igual. Revisá el historial antes de volver a descargar. No se reintenta solo."

const downloadRegisteredNote =
  "El servidor ya registró el reporte en el historial; la descarga del archivo no llegó a iniciarse."

const initialPage: NormalizedPagination = { offset: 0, limit: 20 }

interface ReadRequest {
  readonly query: ReportHistoryQuery
  readonly force: boolean
}

/**
 * W6 consumer (S4, S5, D3): the report type catalog, the report table and the paged
 * generated-report history of area J.
 *
 * The load-bearing rule is that `GET /api/reportes/{tipo}` generates and is recorded by
 * the backend, so it is a write wearing a GET. `generate()` is therefore the only method
 * that can dispatch it, it is reachable only from the explicit "Generar" button, and:
 *
 * - entering the page reads the catalog and the history and never generates;
 * - choosing a type or typing a period only edits the draft and never generates;
 * - refreshing the history (or retrying a failed read) only reads the history;
 * - while a generation is in flight the action is disabled *and* the root store refuses a
 *   duplicate with `CONFLICT`, so one click is at most one request;
 * - after a confirmed generation exactly one history read is issued so the new record is
 *   visible, and a failure of that read is never turned into a second generation;
 * - a failed generation is only retried by another explicit click.
 *
 * The CSV download (W7) is the same kind of effect, so it is wired the same way: it starts only
 * from the explicit "Descargar CSV" action on the report this screen already shows, never on
 * entry, never on a period change and never on a retry; one confirmed download issues exactly
 * one history read so the new record appears, and a failure reports an unknown outcome instead
 * of inviting a duplicate.
 *
 * There is no polling, no TTL and no read of the store from the template that could
 * subscribe: the component owns one subscription per read stream.
 */
@Component({
  selector: "app-reports-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CatalogFilters,
    CatalogFrame,
    HlmButtonImports,
    HlmTableImports,
    NgIcon,
    TablePagination
  ],
  providers: [provideIcons({ lucideChartColumn, lucideFileDown })],
  templateUrl: "./reports-page.html"
})
export class ReportsPage implements OnInit {
  private readonly store = inject(ReportsStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly toast = inject(HotToastService)
  private readonly download = inject(ReportCsvDownload)
  /** The single subscription owners: every read and every explicit action flows through them. */
  private readonly typesReads = new Subject<boolean | null>()
  private readonly historyReads = new Subject<ReadRequest | null>()
  private readonly generations = new Subject<GenerateReportParams>()
  private readonly downloads = new Subject<GenerateReportParams>()
  private revision = 0
  private recoveryUsed = false

  /** The draft request: editing it never dispatches a generation. */
  readonly type = signal("")
  readonly from = signal("")
  readonly to = signal("")
  readonly periodError = signal("")

  private readonly requested = signal<NormalizedPagination>(initialPage)
  readonly catalog = computed(() => this.store.selectTypes())
  readonly typesLoading = computed(() => this.catalog().loading)
  readonly typesRefreshing = computed(() => this.catalog().refreshing)
  readonly typesError = computed(() => {
    const code = this.catalog().error?.code
    return code ? errorMessages[code] : ""
  })
  readonly typesVerified = computed(() => this.catalog().result !== undefined)
  readonly typeOptions = computed<readonly { value: string; label: string }[]>(() => {
    const loaded = this.catalog().result ?? []
    const chosen = this.type()
    const options = loaded.map(item => ({ value: item.type, label: item.title }))
    // A chosen type the refreshed catalog no longer offers stays visible and unselectable
    // for dispatch, instead of silently becoming another type.
    return chosen && !loaded.some(item => item.type === chosen)
      ? [...options, { value: chosen, label: `${chosen} · no disponible` }]
      : options
  })
  readonly typeSelects = computed<readonly CatalogFilterSelect[]>(() => [
    {
      id: "report-type",
      label: "Tipo de reporte",
      allLabel: "Elegí un tipo",
      value: this.type(),
      options: this.typeOptions()
    }
  ])
  readonly periodDates = computed<readonly CatalogFilterDate[]>(() => [
    { id: "report-from", label: "Desde", value: this.from() },
    { id: "report-to", label: "Hasta", value: this.to() }
  ])
  /** The captured request the screen currently describes, or `undefined` without a type. */
  readonly request = computed<GenerateReportParams | undefined>(() =>
    normalizeGenerateReportParams({
      type: this.type(),
      ...(this.from().trim() ? { from: this.from() } : {}),
      ...(this.to().trim() ? { to: this.to() } : {})
    })
  )
  readonly requestKey = computed(() => {
    const request = this.request()
    return request ? reportRequestKey(request) : ""
  })
  private readonly reportEntry = computed(() => this.store.selectReport())
  /** A generated report is shown only while its own type and period are the drafted ones. */
  readonly report = computed<ReportTable | undefined>(() => {
    const entry = this.reportEntry()
    return entry.params && reportRequestKey(entry.params) === this.requestKey()
      ? entry.result
      : undefined
  })
  readonly generating = computed(() => this.store.generating())
  readonly downloading = computed(() => this.store.downloading())
  readonly downloadError = signal("")
  readonly downloadNote = signal("")
  readonly generatingHere = computed(() => {
    const entry = this.reportEntry()
    return (
      this.generating() &&
      entry.params !== undefined &&
      reportRequestKey(entry.params) === this.requestKey()
    )
  })
  readonly generationError = computed(() => {
    const entry = this.reportEntry()
    if (!entry.error || !entry.params) return ""
    return reportRequestKey(entry.params) === this.requestKey()
      ? errorMessages[entry.error.code]
      : ""
  })
  /** A type must be a verified catalog choice; an unknown type is never sent. */
  readonly typeVerified = computed(() => {
    const chosen = this.type()
    return !!chosen && (this.catalog().result ?? []).some(item => item.type === chosen)
  })
  readonly canGenerate = computed(
    () =>
      this.typeVerified() &&
      !this.periodError() &&
      !this.generating() &&
      this.request() !== undefined
  )
  /**
   * A download needs a report this screen already verified for the drafted request, and it is
   * unavailable while a generation or another download is in flight.
   */
  readonly canDownload = computed(
    () => this.report() !== undefined && !this.generating() && !this.downloading()
  )
  readonly history = computed(() => this.store.selectHistory())
  readonly historyRows = computed(() => this.history().result?.items ?? [])
  readonly historyError = computed(() => {
    const code = this.history().error?.code
    return code ? errorMessages[code] : ""
  })
  readonly historyEmpty = computed(
    () => this.history().result !== undefined && this.historyRows().length === 0
  )
  /** Effective server metadata, never a locally assumed page size or offset. */
  readonly effectiveQuery = computed<NormalizedPagination>(() => {
    const page = this.history().result
    return page ? { offset: page.offset, limit: page.limit } : this.requested()
  })
  readonly currentPage = computed(
    () => this.effectiveQuery().offset / this.effectiveQuery().limit + 1
  )
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.history().result?.total ?? 0) / this.effectiveQuery().limit))
  )
  readonly rangeStart = computed(() =>
    this.historyRows().length ? this.history().result!.offset + 1 : 0
  )
  readonly rangeEnd = computed(() =>
    this.historyRows().length ? this.history().result!.offset + this.historyRows().length : 0
  )
  readonly historyTotal = computed(() => this.history().result?.total)
  readonly busy = computed(() => this.typesLoading() || this.history().loading || this.generating())

  constructor() {
    this.historyReads
      .pipe(
        switchMap(request => {
          if (!request) return EMPTY
          const revision = this.revision
          return this.store.observeHistory(request.query, request.force).pipe(
            takeUntilDestroyed(this.destroyRef),
            tap(result => {
              if (!this.current(revision)) return
              result.either(
                page => this.recover(page, revision),
                () => undefined
              )
            }),
            catchError(() => EMPTY)
          )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    this.typesReads
      .pipe(
        switchMap(force => (force === null ? EMPTY : this.store.observeTypes(force))),
        catchError(() => EMPTY),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    this.generations
      .pipe(
        mergeMap(request =>
          this.store.generate(request).pipe(
            take(1),
            map(result => ({ request, result }))
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ result }) => {
        if (this.destroyRef.destroyed) return
        result.either(
          table => {
            // Confirmed generation only: one generic toast and exactly one history read.
            this.toast.success(`Reporte "${table.title}" generado correctamente.`)
            this.historyReads.next({ query: this.effectiveQuery(), force: true })
          },
          // A failed generation invalidates nothing and reads nothing: the error stays
          // visible so the user decides whether to ask for a new generation.
          () => undefined
        )
      })
    this.downloads
      .pipe(
        mergeMap(request =>
          this.store.downloadCsv(request).pipe(
            take(1),
            map(result => ({ request, result }))
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ request, result }) => {
        if (this.destroyRef.destroyed) return
        result.either(
          file => {
            // Confirmed download: the backend registered the report, so the history is read once.
            this.historyReads.next({ query: this.effectiveQuery(), force: true })
            this.startDownload(file, request)
          },
          // Unknown outcome on purpose: the server may have registered it anyway. Nothing is
          // read and nothing is retried; the user decides whether to ask again.
          error => {
            this.downloadError.set(downloadMessage(error.code))
            this.downloadNote.set(downloadUnknownNote)
          }
        )
      })
  }

  ngOnInit(): void {
    // One read of each on entry, in this order and never a generation (S5).
    this.typesReads.next(false)
    this.load(initialPage)
  }

  selectType(value: string): void {
    if (this.destroyRef.destroyed) return
    // Editing the draft never dispatches: it only decides which report is being described.
    this.type.set(value)
  }

  setPeriodDate(change: { id: string; value: string }): void {
    if (this.destroyRef.destroyed) return
    if (change.id === "report-from") this.from.set(change.value)
    else if (change.id === "report-to") this.to.set(change.value)
    else return
    const period = normalizeReportPeriod({
      ...(this.from().trim() ? { from: this.from() } : {}),
      ...(this.to().trim() ? { to: this.to() } : {})
    })
    this.periodError.set(period ? "" : invalidPeriodMessage)
  }

  /** The only path to a generation request in this screen. */
  generate(): void {
    if (this.destroyRef.destroyed || !this.canGenerate()) return
    const request = this.request()
    if (!request) return
    this.downloadError.set("")
    this.downloadNote.set("")
    this.generations.next(request)
  }

  /**
   * The only path to a CSV download in this screen. It needs the report this screen already
   * shows, so entering the page, editing the draft or retrying a read never downloads, and the
   * root store refuses a duplicate while one is in flight.
   */
  downloadCsv(): void {
    if (this.destroyRef.destroyed || !this.canDownload()) return
    const request = this.request()
    if (!request) return
    this.downloadError.set("")
    this.downloadNote.set("")
    this.downloads.next(request)
  }

  retryTypes(): void {
    if (this.destroyRef.destroyed) return
    this.typesReads.next(true)
  }

  retryHistory(): void {
    if (this.destroyRef.destroyed) return
    this.recoveryUsed = false
    this.load(this.requested(), true)
  }

  setPage(page: number): void {
    if (
      this.destroyRef.destroyed ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > this.pageCount() ||
      page === this.currentPage() ||
      this.history().loading
    )
      return
    this.recoveryUsed = false
    // Page navigation keeps the effective server page size and never drops it to a default.
    this.load({
      offset: (page - 1) * this.effectiveQuery().limit,
      limit: this.effectiveQuery().limit
    })
  }

  /** Literal rendering of a supplied cell: `—` marks an explicit null, never a zero. */
  cellText(cell: unknown): string {
    return reportCellText(cell)
  }

  generatedText(value: Date): string {
    return value.toISOString()
  }

  /**
   * One bounded out-of-range recovery per user action: an empty page past the end is
   * corrected once with the effective server size, never looped nor rewritten as the answer.
   */
  private recover(page: PaginationResponse<GeneratedReportSummary>, revision: number): void {
    if (this.recoveryUsed || page.items.length || page.total <= 0 || page.offset < page.total)
      return
    this.recoveryUsed = true
    const offset = Math.floor((page.total - 1) / page.limit) * page.limit
    queueMicrotask(() => {
      if (!this.current(revision)) return
      this.load({ offset, limit: page.limit }, true)
    })
  }

  private current(revision: number): boolean {
    return !this.destroyRef.destroyed && revision === this.revision
  }

  /** Browser half of the confirmed download: bytes to a file, then feedback for that outcome. */
  private startDownload(file: ReportCsvFile, request: GenerateReportParams): void {
    this.download.download(file, request).either(
      () => {
        this.toast.success("Descarga del reporte iniciada.")
      },
      error => {
        this.downloadError.set(downloadMessage(error.code))
        // The registration did happen: say so instead of implying an unknown outcome.
        this.downloadNote.set(downloadRegisteredNote)
      }
    )
  }

  private load(query: ReportHistoryQuery, force = false): void {
    if (this.destroyRef.destroyed) return
    const normalized = normalizeReportHistoryQuery(query)
    if (!normalized) return
    this.revision++
    this.requested.set(normalized)
    this.historyReads.next({ query: normalized, force })
  }
}
