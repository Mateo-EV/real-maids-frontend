import { DatePipe } from "@angular/common"
import { Component, computed, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { defer, finalize, Subscription } from "rxjs"
import { disabled, form, FormField, FormRoot, validate } from "@angular/forms/signals"
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
import { AuditLogsStore } from "../../state/audit-logs.store"
import { AuditDetail, AuditDetailContext } from "../audit-detail/audit-detail"

@Component({
  selector: "app-audit-viewer",
  imports: [
    DatePipe,
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
  readonly pageSize = 5
  readonly pageCount = computed(() => Math.max(1, this.store.totalPages()))
  readonly rangeStart = computed(() =>
    this.store.total() ? (this.page() - 1) * this.pageSize + 1 : 0
  )
  readonly rangeEnd = computed(() => Math.min(this.page() * this.pageSize, this.store.total()))
  readonly exporting = signal(false)
  readonly exportError = signal("")
  readonly filterModel = signal({ fromUTC: "", toUTC: "", userId: "" })
  readonly filterForm = form(this.filterModel, path => {
    for (const field of [path.fromUTC, path.toUTC]) {
      disabled(field, () => this.exporting())
      validate(field, ({ value }) =>
        !value() || validAuditDay(value())
          ? undefined
          : { kind: "date", message: "Usa una fecha válida AAAA-MM-DD." }
      )
    }
    disabled(path.userId, () => this.exporting())
    validate(path.userId, ({ value }) =>
      !value() ||
      (/^-?\d+$/.test(value()) && Number(value()) >= -2147483648 && Number(value()) <= 2147483647)
        ? undefined
        : { kind: "actor", message: "Usa el ID numérico del actor." }
    )
  })

  ngOnInit(): void {
    this.retry()
  }
  retry(): void {
    if (this.destroyRef.destroyed) return
    this.request?.unsubscribe()
    const request = new Subscription()
    this.request = request
    request.add(
      this.store
        .load({
          ...this.filters(),
          page: this.page() - 1,
          size: this.pageSize
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(result => {
          if (!this.destroyRef.destroyed && result.success && this.page() > this.pageCount()) {
            this.page.set(this.pageCount())
            this.retry()
          }
        })
    )
  }
  private updateFilters(filters: AuditFilters): void {
    if (this.destroyRef.destroyed || this.exporting()) return
    this.exportError.set("")
    this.filters.set(filters)
    this.page.set(1)
    this.retry()
  }
  setDay(value: string): void {
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
  setUserId(value: string): void {
    this.updateFilters({
      ...this.filters(),
      userId: value === "" ? undefined : /^-?\d+$/.test(value) ? Number(value) : NaN
    })
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
    this.filterModel.set({ fromUTC: "", toUTC: "", userId: "" })
    this.updateFilters({})
  }
  goToPage(page: number): void {
    if (this.destroyRef.destroyed || this.store.loading() || !Number.isSafeInteger(page)) return
    this.page.set(Math.max(1, Math.min(page, this.pageCount())))
    this.retry()
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
