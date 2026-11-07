import { DatePipe } from "@angular/common"
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  signal,
  untracked,
  viewChild
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { defer, finalize, Subscription } from "rxjs"
import { disabled, form, FormField, FormRoot, validate } from "@angular/forms/signals"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideSlidersHorizontal, lucideX } from "@ng-icons/lucide"
import { BrnCombobox, BrnComboboxInput } from "@spartan-ng/brain/combobox"
import { HlmComboboxImports } from "@spartan-ng/helm/combobox"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmSkeleton } from "@spartan-ng/helm/skeleton"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  AuditFilters,
  validAuditDay
} from "../../../domain/models/audit-query"
import { AuditLog } from "../../../domain/entities/audit-log.entity"
import { ExportAuditLogsUseCase } from "../../../application/use-cases/export-audit-logs.use-case"
import { AuditCsvDownload } from "../../../infrastructure/export/audit-csv-download"
import { UserStore } from "../../state/user.store"
import { UserListQuery } from "../../../domain/models/user-list-query"
import { AuditLogsStore } from "../../state/audit-logs.store"
import { AuditDetail, AuditDetailContext } from "../audit-detail/audit-detail"

@Component({
  selector: "app-audit-viewer",
  imports: [
    DatePipe,
    NgIcon,
    BrnComboboxInput,
    HlmComboboxImports,
    HlmInputImports,
    FormField,
    FormRoot,
    HlmFieldImports,
    HlmButtonImports,
    HlmNativeSelectImports,
    HlmInputGroupImports,
    HlmTableImports,
    HlmBadgeImports,
    HlmEmptyImports,
    HlmAlertImports,
    HlmSpinnerImports,
    HlmSkeleton,
    TablePagination
  ],
  providers: [provideIcons({ lucideSlidersHorizontal, lucideX })],
  templateUrl: "./audit-viewer.html"
})
export class AuditViewer implements OnInit {
  readonly store = inject(AuditLogsStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly exporter = inject(ExportAuditLogsUseCase)
  private readonly downloader = inject(AuditCsvDownload)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private request?: Subscription
  readonly entities = AUDIT_ENTITIES
  readonly actions = AUDIT_ACTIONS
  readonly filters = signal<AuditFilters>({})
  readonly page = signal(1)
  readonly active = input(true)
  private initialized = false
  private wasActive = true
  private readonly effectiveSize = signal(5)
  get pageSize(): number {
    return this.effectiveSize()
  }
  readonly pageCount = computed(() => Math.max(1, this.store.totalPages()))
  readonly rangeStart = computed(() =>
    this.store.total() ? (this.page() - 1) * this.pageSize + 1 : 0
  )
  readonly rangeEnd = computed(() => Math.min(this.page() * this.pageSize, this.store.total()))
  readonly exporting = signal(false)
  readonly exportError = signal("")
  readonly users = inject(UserStore)
  private readonly actorQuery = signal<UserListQuery>({ offset: 0, limit: 10 })
  readonly actors = this.users.selectQuery(this.actorQuery)
  private actorRequest?: Subscription
  readonly selectedActor = signal<{ id: number; name: string; email: string } | undefined>(
    undefined
  )
  readonly actorReady = computed(
    () => this.actors.loaded() && !this.actors.loading() && !this.actors.error()
  )
  readonly actorOptions = computed(() => {
    const selected = this.selectedActor()
    const users = this.actors.loaded() ? (this.actors.result()?.items ?? []) : []
    return selected ? [selected, ...users.filter(user => user.id !== selected.id)] : users
  })
  readonly actorPage = computed(
    () => (this.actors.query().offset ?? 0) / (this.actors.query().limit ?? 10) + 1
  )
  readonly actorPageCount = computed(() => {
    const result = this.actors.result()
    return Math.max(1, result ? Math.ceil(result.total / result.limit) : 1)
  })
  private loadActors(query: UserListQuery, delay = 0, force = false): void {
    if (this.destroyRef.destroyed) return
    this.actorRequest?.unsubscribe()
    this.actorQuery.set(query)
    const request = new Subscription()
    this.actorRequest = request
    request.add(
      this.users
        .observeQuery(query, delay, force)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe()
    )
  }
  retryActors(): void {
    if (!this.exporting()) this.loadActors(this.actorQuery(), 0, true)
  }
  goToActorPage(page: number): void {
    if (
      this.exporting() ||
      !this.actorReady() ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > this.actorPageCount() ||
      page === this.actorPage()
    )
      return
    const query = this.actors.query()
    this.loadActors({ ...query, offset: (page - 1) * (query.limit ?? 10) })
  }
  readonly advancedOpen = signal(false)
  readonly actorOpen = signal<"open" | "closed">("closed")
  private readonly actorCombobox = viewChild(BrnCombobox)
  readonly activeActorOption = signal<string | null>(null)
  constructor() {
    effect(() => {
      const active = this.active()
      const revisiting = active && !this.wasActive
      this.wasActive = active
      if (revisiting && this.initialized) untracked(() => this.read())
    })
    effect(() => {
      if (!(this.users.sessionRevision() + this.store.sessionRevision())) return
      this.selectedActor.set(undefined)
      this.filters.update(filters => ({ ...filters, userId: undefined }))
    })
    // Brain manages keyboard highlighting; expose its active option to assistive technology.
    effect(onCleanup => {
      const combobox = this.actorCombobox()
      if (!combobox) return
      const subscription = combobox.keyManager.change.subscribe(() => {
        this.activeActorOption.set(combobox.keyManager.activeItem?.id() ?? null)
      })
      onCleanup(() => subscription.unsubscribe())
    })
  }
  readonly secondaryCount = computed(() => {
    const { fromUTC, toUTC, entity, action } = this.filters()
    return [fromUTC, toUTC, entity, action].filter(Boolean).length
  })
  readonly appliedChips = computed(() => {
    const filters = this.filters()
    const chips: { field: "userId" | "fromUTC" | "toUTC" | "entity" | "action"; label: string }[] =
      []
    if (filters.userId !== undefined)
      chips.push({ field: "userId", label: `Actor: ${this.actorLabel(String(filters.userId))}` })
    for (const [field, title] of [
      ["fromUTC", "Desde (UTC)"],
      ["toUTC", "Hasta (UTC)"],
      ["entity", "Entidad"],
      ["action", "Acción"]
    ] as const) {
      if (filters[field]) chips.push({ field, label: `${title}: ${filters[field]}` })
    }
    return chips
  })
  readonly actorLabel = (value: string): string => {
    if (value === "all") return "Todos los actores"
    const actor =
      this.selectedActor()?.id === Number(value)
        ? this.selectedActor()
        : this.actorOptions().find(user => String(user.id) === value)
    return actor ? `${actor.name} · ${actor.email} (USR-${actor.id})` : `USR-${value}`
  }
  readonly actorOptionLabel = (value: string): string => {
    if (value === "all") return "Todos los actores"
    const actor =
      this.selectedActor()?.id === Number(value)
        ? this.selectedActor()
        : this.actorOptions().find(user => String(user.id) === value)
    return actor ? `${actor.name} · ${actor.email}` : "Actor no disponible"
  }
  // The server filters names/emails; Brain must not filter the returned page again.
  readonly showActorOption = () => true
  readonly filterModel = signal({ fromUTC: "", toUTC: "", actorSearch: "" })
  searchActors(value: string): void {
    if (this.destroyRef.destroyed || this.exporting()) return
    if (value === this.filterModel().actorSearch) return
    this.filterModel.update(model => ({ ...model, actorSearch: value }))
    this.loadActors(
      {
        offset: 0,
        limit: this.actors.query().limit ?? 10,
        ...(value.trim() ? { search: value.trim() } : {})
      },
      250
    )
  }
  actorStateChanged(state: "open" | "closed"): void {
    this.actorOpen.set(this.exporting() ? "closed" : state)
  }
  removeFilter(field: "userId" | "fromUTC" | "toUTC" | "entity" | "action"): void {
    if (this.destroyRef.destroyed || this.exporting()) return
    if (field === "userId") this.selectedActor.set(undefined)
    if (field === "fromUTC" || field === "toUTC")
      this.filterModel.update(model => ({ ...model, [field]: "" }))
    this.updateFilters({ ...this.filters(), [field]: undefined })
  }
  readonly filterForm = form(this.filterModel, path => {
    for (const field of [path.fromUTC, path.toUTC]) {
      disabled(field, () => this.exporting())
      validate(field, ({ value }) =>
        !value() || validAuditDay(value())
          ? undefined
          : { kind: "date", message: "Usa una fecha válida AAAA-MM-DD." }
      )
    }
    disabled(path.actorSearch, () => this.exporting())
  })

  ngOnInit(): void {
    this.loadActors(this.actors.query())
    this.read()
    this.initialized = true
  }
  retry(): void {
    this.read(true)
  }
  private read(force = false, recovered = false): void {
    if (this.destroyRef.destroyed) return
    this.request?.unsubscribe()
    const request = new Subscription()
    this.request = request
    request.add(
      this.store
        .load(
          {
            ...this.filters(),
            page: this.page() - 1,
            size: this.pageSize
          },
          force
        )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(result => {
          if (this.destroyRef.destroyed || !result.success) return
          this.effectiveSize.set(result.data.size)
          if (!recovered && this.page() > this.pageCount()) {
            this.page.set(this.pageCount())
            this.read(true, true)
          } else this.page.set(result.data.page + 1)
        })
    )
  }
  private updateFilters(filters: AuditFilters): void {
    if (this.destroyRef.destroyed || this.exporting()) return
    this.exportError.set("")
    this.filters.set(filters)
    this.page.set(1)
    this.read()
  }
  setDay(value: string): void {
    if (this.destroyRef.destroyed || this.exporting()) return
    this.filterModel.update(model => ({ ...model, fromUTC: value, toUTC: value }))
    this.updateFilters({
      ...this.filters(),
      dayUTC: undefined,
      fromUTC: value || undefined,
      toUTC: value || undefined
    })
  }
  setFrom(value: string): void {
    this.updateFilters({ ...this.filters(), dayUTC: undefined, fromUTC: value || undefined })
  }
  setTo(value: string): void {
    this.updateFilters({ ...this.filters(), dayUTC: undefined, toUTC: value || undefined })
  }
  selectActor(value: string | null | undefined): void {
    if (this.destroyRef.destroyed || this.exporting()) return
    if (!value || value === "all") {
      this.searchActors("")
      this.selectedActor.set(undefined)
      this.updateFilters({ ...this.filters(), userId: undefined })
      return
    }
    if (value === String(this.selectedActor()?.id)) return
    if (!this.actorReady()) return
    // Only a loaded option supplies identity; search text is never an ID.
    const actor = this.actors.result()?.items.find(user => String(user.id) === value)
    if (!actor) return
    this.selectedActor.set({ id: actor.id, name: actor.name, email: actor.email })
    this.updateFilters({ ...this.filters(), userId: actor.id })
  }
  setEntity(value: string | null | undefined): void {
    // Controls supply catalog values; unrecognized inputs remain invalid, never silently widen a query.
    this.updateFilters({
      ...this.filters(),
      entity: (value || undefined) as AuditFilters["entity"]
    })
  }
  setAction(value: string | null | undefined): void {
    this.updateFilters({
      ...this.filters(),
      action: (value || undefined) as AuditFilters["action"]
    })
  }
  clearFilters(): void {
    if (this.destroyRef.destroyed || this.exporting()) return
    this.selectedActor.set(undefined)
    this.searchActors("")
    this.filterModel.set({ fromUTC: "", toUTC: "", actorSearch: "" })
    this.updateFilters({})
  }
  goToPage(page: number): void {
    if (this.destroyRef.destroyed || this.store.loading() || !Number.isSafeInteger(page)) return
    this.page.set(Math.max(1, Math.min(page, this.pageCount())))
    this.read()
  }
  showDetail(log: AuditLog): void {
    if (this.destroyRef.destroyed) return
    this.dialogs.open<void, AuditDetailContext>(AuditDetail, {
      context: { logId: log.id },
      showCloseButton: false,
      disableClose: true,
      autoFocus: "first-tabbable",
      restoreFocus: true,
      contentClass: "max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
    })
  }
  exportCsv(): void {
    if (
      this.destroyRef.destroyed ||
      this.exporting() ||
      this.store.loading() ||
      this.store.error() ||
      this.store.total() === 0
    )
      return
    this.actorOpen.set("closed")
    this.exporting.set(true)
    this.exportError.set("")
    const filters = { ...this.filters() }
    defer(() => this.exporter.execute(filters))
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.exporting.set(false))
      )
      .subscribe({
        next: result => {
          if (this.destroyRef.destroyed) return
          if (!result.success) {
            this.exportError.set(result.error.message)
            return
          }
          const downloaded = this.downloader.download(result.data)
          if (downloaded.success) this.toast.success("Descarga de auditoría iniciada")
          else this.exportError.set(downloaded.error.message)
        },
        error: () => {
          if (!this.destroyRef.destroyed)
            this.exportError.set("No se pudo exportar la auditoría. Inténtalo de nuevo.")
        }
      })
  }
}
