import { Component, computed, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { Dialog, DialogConfig, DEFAULT_DIALOG_CONFIG } from "@angular/cdk/dialog"
import { BrnDialogRef, BrnDialogService } from "@spartan-ng/brain/dialog"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { catchError, EMPTY, Subject, switchMap, takeUntil, tap } from "rxjs"
import { HlmAlert, HlmAlertDescription, HlmAlertTitle } from "@spartan-ng/helm/alert"
import { HlmBadge } from "@spartan-ng/helm/badge"
import { HlmButton } from "@spartan-ng/helm/button"
import {
  HlmEmpty,
  HlmEmptyDescription,
  HlmEmptyHeader,
  HlmEmptyTitle
} from "@spartan-ng/helm/empty"
import { HlmLabel } from "@spartan-ng/helm/label"
import { HlmNativeSelect, HlmNativeSelectOption } from "@spartan-ng/helm/native-select"
import { HlmSpinner } from "@spartan-ng/helm/spinner"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { FieldOperationsError } from "../../../domain/errors/field-operations.error"
import {
  StaffAbsence,
  staffAbsenceStatuses,
  staffAbsenceStatusName,
  StaffAbsenceDecision,
  StaffAbsenceStatus
} from "../../../domain/models/staff-absence"
import {
  StaffAbsenceDecisionContext,
  StaffAbsenceDecisionDialog
} from "../../components/staff-absence-decision-dialog/staff-absence-decision-dialog"
import { StaffAbsencesStore } from "../../state/staff-absences.store"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { BadgeTone } from "@/app/shared/ui/badge-tone.directive"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"

type Query = Required<PaginationParams> & { status?: StaffAbsenceStatus }
type Page = PaginationResponse<StaffAbsence>
/** The latched denial, presented as the read's own error so one message explains the screen. */
const forbiddenRead = () => new FieldOperationsError("FORBIDDEN", "Absence read denied")

/**
 * M06/RF07/HU07/P07 (S2–S7, S9–S11) — `/admin/staff/absences`, the HR queue.
 *
 * HR reads the same documented listing as the employee but with the closed `estado` filter, and
 * resolves what the supplied state allows: approve or reject a pending request, and withdraw an
 * approved one. The frontend never encodes that table as an authority — the backend validates every
 * move, including the "resolve the conflicting services first" rule that blocks an approval (S5) and
 * the overlap/duplicate rejection of a request (S11).
 *
 * The mandatory reason is visible here because HR is one of the two authorized readers (S7, S9); it
 * is printed as plain text and never serialized into the URL, a log or a toast. Conflicts and
 * refusals keep project-owned copy, never the backend's own text.
 *
 * One absence detail is read only when it is explicitly opened, through the root store, so the queue
 * performs no N+1 lookup. Reads reuse the 30000 ms success-only freshness, ref-counted flights,
 * verified same-key data and the session/SSR fencing of that store; this page owns its filter, its
 * page state, its dialog and its cancellation.
 */
@Component({
  selector: "app-staff-absences-review-page",
  providers: [
    HlmDialogService,
    BrnDialogService,
    Dialog,
    {
      // Route-local: an explicit owner/away/session guard owns dismissal, never the router.
      provide: DEFAULT_DIALOG_CONFIG,
      useFactory: () => ({
        ...new DialogConfig(),
        ...inject(DEFAULT_DIALOG_CONFIG, { optional: true, skipSelf: true }),
        closeOnNavigation: false
      })
    }
  ],
  imports: [
    CatalogFrame,
    TablePagination,
    BadgeTone,
    HlmAlert,
    HlmAlertDescription,
    HlmAlertTitle,
    HlmBadge,
    HlmButton,
    HlmEmpty,
    HlmEmptyDescription,
    HlmEmptyHeader,
    HlmEmptyTitle,
    HlmLabel,
    HlmNativeSelect,
    HlmNativeSelectOption,
    HlmSpinner
  ],
  templateUrl: "./staff-absences-review-page.html"
})
export class StaffAbsencesReviewPage implements OnInit {
  private readonly store = inject(StaffAbsencesStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private dialog: BrnDialogRef | undefined
  private dialogIdentity: object | undefined
  private readonly ownerChanged = new Subject<void>()
  private readonly queries = new Subject<{ query: Query; force: boolean } | null>()
  private readonly detailRequests = new Subject<{ id: number; force: boolean } | null>()
  private readonly requested = signal<Query>({ offset: 0, limit: 20 })
  readonly selectedStatus = signal<StaffAbsenceStatus | "">("")
  readonly detailId = signal<number | null>(null)
  private readonly detailError = signal("")
  private readonly admissionError = signal("")
  /**
   * A denial is authoritative for the queue: once the server answers `FORBIDDEN` the verified rows,
   * their reasons, the totals and an open detail stop rendering until an authorized read succeeds.
   * The detail family keeps its own denial flag for the same reason, one record at a time. Transient
   * failures keep the verified same-key data with a visible stale notice.
   */
  private readonly deniedAccess = signal(false)
  private readonly detailDeniedAccess = signal(false)
  private revision = 0
  private recoveryUsed = false
  private readonly scope = createSessionReadScope(() => {
    this.stopDialog()
    this.revision++
    this.queries.next(null)
    this.detailRequests.next(null)
    this.detailId.set(null)
    this.detailError.set("")
    this.admissionError.set("")
    this.selectedStatus.set("")
    this.requested.set({ offset: 0, limit: 20 })
    const generation = this.scope.generation()
    queueMicrotask(() => {
      if (!this.current(generation)) return
      this.recoveryUsed = false
      this.load({ offset: 0, limit: 20 })
    })
  })

  readonly statuses = staffAbsenceStatuses
  readonly statusName = staffAbsenceStatusName
  readonly list = computed(() => this.store.selectAbsences(this.requested()))
  readonly result = computed(() => (this.denied() ? undefined : this.list().result))
  readonly rows = computed(() => this.result()?.items ?? [])
  readonly query = computed<Query>(() => {
    const page = this.result()
    return page
      ? {
          offset: page.offset,
          limit: page.limit,
          ...(this.requested().status ? { status: this.requested().status } : {})
        }
      : this.requested()
  })
  readonly currentPage = computed(() => Math.floor(this.query().offset / this.query().limit) + 1)
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.result()?.total ?? 0) / this.query().limit))
  )
  readonly rangeStart = computed(() => (this.rows().length ? this.result()!.offset + 1 : 0))
  readonly rangeEnd = computed(() =>
    this.rows().length ? this.result()!.offset + this.rows().length : 0
  )
  /**
   * The queue latch is the primary fact: once denied, only a successful authorized read clears it, so
   * a later transient failure — or any retained entry of another query — cannot present the denial
   * as staleness and bring protected rows back.
   */
  readonly denied = computed(() => this.deniedAccess() || this.list().error?.code === "FORBIDDEN")
  readonly error = computed(() => (this.denied() ? forbiddenRead() : this.list().error))
  readonly errorMessage = computed(() => {
    switch (this.error()?.code) {
      case "FORBIDDEN":
        return "No tienes permiso para revisar las ausencias del personal."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNCONFIGURED":
        return "El servicio de ausencias no está disponible en este entorno."
      default:
        return "No se pudieron cargar las ausencias del personal. Inténtalo de nuevo."
    }
  })
  readonly detail = computed(() => {
    const id = this.detailId()
    return id === null ? undefined : this.store.selectAbsence(id)
  })
  /** A denied detail — or a denied queue — never renders the record it was showing. */
  readonly detailDenied = computed(
    () => this.detailDeniedAccess() || this.detail()?.error?.code === "FORBIDDEN"
  )
  readonly detailRecord = computed(() =>
    this.denied() || this.detailDenied() ? undefined : this.detail()?.result
  )
  readonly detailLoading = computed(() => this.detail()?.loading ?? false)
  readonly detailErrorMessage = computed(() => {
    if (this.detailDenied()) return "No tienes permiso para consultar el detalle de esta ausencia."
    const error = this.detail()?.error
    if (!error) return this.detailError()
    return error.code === "NOT_FOUND"
      ? "La ausencia ya no está disponible para tu consulta."
      : "No se pudo cargar el detalle de la ausencia. Inténtalo de nuevo."
  })

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopDialog()
      this.ownerChanged.complete()
    })
  }

  ngOnInit(): void {
    this.queries
      .pipe(
        switchMap(request => {
          if (!request) return EMPTY
          const { query, force } = request
          const revision = this.revision
          const generation = this.scope.generation()
          return this.store.observeAbsences(query, force).pipe(
            takeUntil(this.scope.cancelled$),
            tap(response => {
              if (!this.current(generation, revision)) return
              if (!response.success) {
                if (response.error.code === "FORBIDDEN") {
                  this.deny()
                  return
                }
                if (!this.store.selectAbsences(query).error)
                  this.admissionError.set("No se pudieron cargar las ausencias del personal.")
                return
              }
              this.deniedAccess.set(false)
              const page = response.data
              if (
                this.recoveryUsed ||
                page.items.length ||
                page.total <= 0 ||
                page.offset < page.total
              )
                return
              this.recoveryUsed = true
              queueMicrotask(() => {
                if (!this.current(generation, revision)) return
                this.load(
                  {
                    ...this.query(),
                    offset: Math.floor((page.total - 1) / page.limit) * page.limit,
                    limit: page.limit
                  },
                  true
                )
              })
            }),
            catchError(() => {
              if (this.current(generation, revision))
                this.admissionError.set("No se pudieron cargar las ausencias del personal.")
              return EMPTY
            })
          )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    this.detailRequests
      .pipe(
        switchMap(request =>
          request === null
            ? EMPTY
            : this.store.observeAbsence(request.id, request.force).pipe(
                tap(response => {
                  if (!this.current(this.scope.generation())) return
                  this.detailError.set("")
                  if (!response.success && response.error.code === "FORBIDDEN") {
                    // The denial owns this record: drop it and any overlay that was showing it.
                    this.detailDeniedAccess.set(true)
                    this.stopDialog()
                    return
                  }
                  if (response.success) this.detailDeniedAccess.set(false)
                }),
                catchError(() => {
                  if (this.current(this.scope.generation()))
                    this.detailError.set("No se pudo cargar el detalle de la ausencia.")
                  return EMPTY
                })
              )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    if (this.scope.check()) this.load(this.requested())
  }

  retry(): void {
    this.recoveryUsed = false
    this.load(this.requested(), true)
  }

  filterStatus(value: string): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    // The select publishes `all` for the unfiltered queue, exactly like the staff directory.
    const next = value === "" || value === "all" ? "" : (value as StaffAbsenceStatus)
    if (next !== "" && !staffAbsenceStatuses.includes(next)) return
    if (next === this.selectedStatus()) return
    this.selectedStatus.set(next)
    this.recoveryUsed = false
    // A filter change restarts at the first page and keeps the effective page size.
    this.load({
      offset: 0,
      limit: this.query().limit,
      ...(next === "" ? {} : { status: next })
    })
  }

  goToPage(page: number): void {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > this.pageCount() ||
      page === this.currentPage() ||
      this.list().loading ||
      !this.result()
    )
      return
    this.recoveryUsed = false
    this.load({
      ...this.query(),
      offset: (page - 1) * this.query().limit,
      limit: this.query().limit
    })
  }

  /** S5/S6: the moves the supplied state allows; the backend still validates every one of them. */
  decisions(absence: StaffAbsence): readonly StaffAbsenceDecision[] {
    switch (absence.status) {
      case "PENDIENTE":
        return ["APROBADA", "RECHAZADA"]
      case "APROBADA":
        return ["RETIRADA"]
      default:
        return []
    }
  }

  actionLabel(decision: StaffAbsenceDecision): string {
    switch (decision) {
      case "APROBADA":
        return "Aprobar"
      case "RECHAZADA":
        return "Rechazar"
      case "RETIRADA":
        return "Retirar"
      case "CANCELADA":
        return "Cancelar"
    }
  }

  /** One absence detail is read only on an explicit request; closing releases the observation. */
  openDetail(id: number): void {
    if (this.destroyRef.destroyed || !this.scope.check() || this.denied()) return
    this.detailError.set("")
    // A latched detail denial also reads from the server: a retained entry cannot clear it.
    const force = this.detailDeniedAccess()
    this.detailDeniedAccess.set(false)
    this.detailId.set(id)
    this.detailRequests.next({ id, force })
  }

  closeDetail(): void {
    this.detailId.set(null)
    this.detailError.set("")
    this.detailDeniedAccess.set(false)
    this.detailRequests.next(null)
  }

  retryDetail(): void {
    const id = this.detailId()
    if (id === null || this.detail()?.loading || this.detail()?.refreshing) return
    this.detailError.set("")
    this.detailRequests.next({ id, force: true })
  }

  decide(absence: StaffAbsence, target: StaffAbsenceDecision): void {
    if (this.destroyRef.destroyed || !this.scope.check() || this.denied() || this.dialog?.open)
      return
    if (!this.decisions(absence).includes(target)) return
    const generation = this.scope.generation()
    const identity = {}
    this.dialogIdentity = identity
    const current = () =>
      !this.destroyRef.destroyed &&
      this.dialogIdentity === identity &&
      this.current(generation) &&
      !!this.dialog?.open
    const context: StaffAbsenceDecisionContext = {
      absence: {
        id: absence.id,
        staffName: absence.staffName,
        startDate: absence.startDate,
        endDate: absence.endDate,
        days: absence.days,
        status: absence.status
      },
      target,
      actor: "hr",
      owner: this.destroyRef,
      ownerChanged$: this.ownerChanged.asObservable(),
      current,
      onChanged: () => {
        if (!current()) return
        this.toast.success(
          target === "APROBADA"
            ? "Ausencia aprobada."
            : target === "RECHAZADA"
              ? "Ausencia rechazada."
              : "Ausencia retirada."
        )
        // Confirmed success alone; the store already expired the queue and this detail, and their
        // active observations re-read them exactly once. No duplicate reload is added here.
      }
    }
    this.dialog = this.dialogs.open(StaffAbsenceDecisionDialog, {
      context,
      disableClose: true,
      showCloseButton: false,
      contentClass: "sm:max-w-lg max-h-[90dvh] overflow-y-auto"
    })
  }

  /** Queue denial: nothing protected survives, including an open detail and its overlay. */
  private deny(): void {
    this.deniedAccess.set(true)
    this.admissionError.set("")
    this.closeDetail()
    this.stopDialog()
  }

  private stopDialog(): void {
    const dialog = this.dialog
    this.dialog = undefined
    this.dialogIdentity = undefined
    this.ownerChanged.next()
    if (this.destroyRef.destroyed) dialog?.forceClose()
    else dialog?.close()
  }

  private current(generation: number, revision?: number): boolean {
    return (
      !this.destroyRef.destroyed &&
      this.scope.check() &&
      generation === this.scope.generation() &&
      (revision === undefined || revision === this.revision)
    )
  }

  private load(query: Query, force = false): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    this.revision++
    this.admissionError.set("")
    this.requested.set(query)
    // While the queue denial is latched every read is a real server read, so a cached entry can never
    // stand in for the authorization that has to clear it.
    this.queries.next({ query, force: force || this.deniedAccess() })
  }
}
