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
import { HlmSpinner } from "@spartan-ng/helm/spinner"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { FieldOperationsError } from "@/app/features/field-operations/domain/errors/field-operations.error"
import {
  StaffAbsence,
  staffAbsenceStatusName
} from "@/app/features/field-operations/domain/models/staff-absence"
import {
  StaffAbsenceEditor,
  StaffAbsenceEditorContext
} from "@/app/features/field-operations/presentation/components/staff-absence-editor/staff-absence-editor"
import {
  StaffAbsenceDecisionContext,
  StaffAbsenceDecisionDialog
} from "@/app/features/field-operations/presentation/components/staff-absence-decision-dialog/staff-absence-decision-dialog"
import { StaffAbsencesStore } from "@/app/features/field-operations/presentation/state/staff-absences.store"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { BadgeTone } from "@/app/shared/ui/badge-tone.directive"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"

type Query = Required<PaginationParams>
type Page = PaginationResponse<StaffAbsence>
/** The latched denial, presented as the read's own error so one message explains the screen. */
const forbiddenRead = () => new FieldOperationsError("FORBIDDEN", "Absence read denied")

/**
 * WP11/M06 — `/staff/absences`, «Mis ausencias»: the employee's own absence requests.
 *
 * The backend resolves the caller's staff record (`idPersonal` is never sent) and is the authority on
 * every move: an employee requests days and a mandatory reason, and may only cancel a request that is
 * still pending (S6). The reason is printed for its owner (S7) and never enters a URL, a toast or a
 * log.
 *
 * Reads reuse the root `StaffAbsencesStore` (30000 ms success-only freshness, ref-counted flights,
 * verified same-key data kept on failure, session fencing); this page owns only its page state, its
 * feedback, its cancellation and one bounded out-of-range recovery per user action. Paging is page
 * state, not a URL contract: nothing about an absence is serialized into the address bar.
 */
@Component({
  selector: "app-staff-absences-page",
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
    HlmSpinner
  ],
  templateUrl: "./staff-absences-page.html"
})
export class StaffAbsencesPage implements OnInit {
  private readonly store = inject(StaffAbsencesStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private dialog: BrnDialogRef | undefined
  private dialogIdentity: object | undefined
  private readonly ownerChanged = new Subject<void>()
  private readonly queries = new Subject<{ query: Query; force: boolean } | null>()
  private readonly requested = signal<Query>({ offset: 0, limit: 20 })
  private readonly admissionError = signal("")
  /**
   * A denied read is authoritative: once the server answers `FORBIDDEN` nothing verified is shown
   * again — not the rows, not their reason, not a range or a total — until an authorized read
   * succeeds. A transient failure keeps the verified same-key rows with a stale notice instead.
   */
  private readonly deniedAccess = signal(false)
  private revision = 0
  private recoveryUsed = false
  private readonly scope = createSessionReadScope(() => {
    this.stopDialog()
    this.revision++
    this.queries.next(null)
    this.admissionError.set("")
    this.requested.set({ offset: 0, limit: 20 })
    const generation = this.scope.generation()
    // A session replacement runs inside a transition; wait before admitting the new read.
    queueMicrotask(() => {
      if (!this.current(generation)) return
      this.recoveryUsed = false
      this.load({ offset: 0, limit: 20 })
    })
  })

  readonly list = computed(() => this.store.selectAbsences(this.requested()))
  /**
   * The latch is the primary fact: once denied, only a successful authorized read clears it, so a
   * later transient failure — and any retained entry — cannot make the denial read as staleness.
   */
  readonly denied = computed(() => this.deniedAccess() || this.list().error?.code === "FORBIDDEN")
  readonly error = computed(() => (this.denied() ? forbiddenRead() : this.list().error))
  readonly result = computed(() => (this.denied() ? undefined : this.list().result))
  readonly rows = computed(() => this.result()?.items ?? [])
  readonly query = computed<Query>(() => {
    const page = this.result()
    return page ? { offset: page.offset, limit: page.limit } : this.requested()
  })
  readonly currentPage = computed(() => Math.floor(this.query().offset / this.query().limit) + 1)
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.result()?.total ?? 0) / this.query().limit))
  )
  readonly rangeStart = computed(() => (this.rows().length ? this.result()!.offset + 1 : 0))
  readonly rangeEnd = computed(() =>
    this.rows().length ? this.result()!.offset + this.rows().length : 0
  )
  readonly errorMessage = computed(() => {
    switch (this.error()?.code) {
      case "FORBIDDEN":
        return "No tienes permiso para consultar tus ausencias."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNCONFIGURED":
        return "El servicio de ausencias no está disponible en este entorno."
      case "UNAVAILABLE":
        return "No se pudo iniciar la consulta de tus ausencias. Inténtalo de nuevo."
      default:
        return "No se pudieron cargar tus ausencias. Inténtalo de nuevo."
    }
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
                  this.admissionError.set("No se pudieron cargar tus ausencias.")
                return
              }
              this.deniedAccess.set(false)
              const page = response.data
              // One bounded recovery: the server shrank and this page is past its own total.
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
                    offset: Math.floor((page.total - 1) / page.limit) * page.limit,
                    limit: page.limit
                  },
                  true
                )
              })
            }),
            catchError(() => {
              if (this.current(generation, revision))
                this.admissionError.set("No se pudieron cargar tus ausencias.")
              return EMPTY
            })
          )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    if (this.scope.check()) this.load(this.requested())
  }

  retry(): void {
    this.recoveryUsed = false
    this.load(this.requested(), true)
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
    this.load({ offset: (page - 1) * this.query().limit, limit: this.query().limit })
  }

  statusLabel(absence: StaffAbsence): string {
    return staffAbsenceStatusName(absence.status)
  }

  /** S6: only a request still pending may be cancelled by its own employee. */
  canCancel(absence: StaffAbsence): boolean {
    return absence.status === "PENDIENTE"
  }

  cancelLabel(absence: StaffAbsence): string {
    return `Cancelar la solicitud de ausencia del ${absence.startDate} al ${absence.endDate}`
  }

  create(): void {
    if (this.destroyRef.destroyed || !this.scope.check() || this.denied() || this.dialog?.open)
      return
    const generation = this.scope.generation()
    const identity = {}
    this.dialogIdentity = identity
    const current = () =>
      !this.destroyRef.destroyed &&
      this.dialogIdentity === identity &&
      this.current(generation) &&
      !!this.dialog?.open
    const context: StaffAbsenceEditorContext = {
      owner: this.destroyRef,
      ownerChanged$: this.ownerChanged.asObservable(),
      onSaved: () => {
        if (!current()) return
        this.toast.success("Solicitud de ausencia registrada.")
        // Confirmed success alone; the store already expired this page, and the active observation
        // performs exactly one re-read. No duplicate reload is added here.
      }
    }
    this.dialog = this.dialogs.open(StaffAbsenceEditor, {
      context,
      disableClose: true,
      showCloseButton: false,
      contentClass: "sm:max-w-lg max-h-[90dvh] overflow-y-auto"
    })
  }

  cancel(absence: StaffAbsence): void {
    if (this.destroyRef.destroyed || !this.scope.check() || this.denied() || this.dialog?.open)
      return
    if (!this.canCancel(absence)) return
    const generation = this.scope.generation()
    const identity = {}
    this.dialogIdentity = identity
    const captured = absence.id
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
      target: "CANCELADA",
      actor: "owner",
      owner: this.destroyRef,
      ownerChanged$: this.ownerChanged.asObservable(),
      current,
      onChanged: () => {
        if (!current() || captured !== absence.id) return
        this.toast.success("Solicitud de ausencia cancelada.")
        // The store already expired this page; the active observation re-reads it exactly once.
      }
    }
    this.dialog = this.dialogs.open(StaffAbsenceDecisionDialog, {
      context,
      disableClose: true,
      showCloseButton: false,
      contentClass: "sm:max-w-lg max-h-[90dvh] overflow-y-auto"
    })
  }

  /** The denial is authoritative: close whatever overlay is open and stop rendering rows. */
  private deny(): void {
    this.deniedAccess.set(true)
    this.admissionError.set("")
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
    // While the denial is latched every read is a real server read, so a cached entry can never
    // stand in for the authorization that has to clear it.
    this.queries.next({ query, force: force || this.deniedAccess() })
  }
}
