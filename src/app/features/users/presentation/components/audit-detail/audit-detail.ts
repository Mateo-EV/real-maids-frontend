import { DatePipe } from "@angular/common"
import { Component, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { defer, finalize } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { GetAuditLogByIdUseCase } from "../../../application/use-cases/get-audit-log-by-id.use-case"
import { AuditLog } from "../../../domain/entities/audit-log.entity"
import { connectUserDialogDismissal } from "../user-dialog-dismissal"

export interface AuditDetailContext {
  logId: number
}

@Component({
  selector: "app-audit-detail",
  imports: [DatePipe, HlmDialogImports, HlmButtonImports, HlmAlertImports, HlmSpinnerImports],
  template: `
    <hlm-dialog-header>
      <h2 hlmDialogTitle>Detalle de auditoría · LOG-{{ context.logId }}</h2>
      <p hlmDialogDescription>Metadatos y cambios disponibles del registro seleccionado.</p>
    </hlm-dialog-header>
    @if (loading()) {
      <div class="flex items-center gap-3 py-6" role="status"><hlm-spinner />Cargando detalle…</div>
    } @else if (error()) {
      <div hlmAlert variant="destructive" class="my-4" role="alert">
        <h3 hlmAlertTitle>No pudimos cargar el detalle</h3>
        <p hlmAlertDescription>{{ error() }}</p>
      </div>
      <button hlmBtn variant="outline" type="button" (click)="retry()">Reintentar</button>
    } @else if (log(); as record) {
      <dl class="my-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted-foreground">Fecha UTC</dt>
        <dd class="font-mono break-words">
          {{ record.date | date: "yyyy-MM-dd HH:mm:ss" : "UTC" }}
        </dd>
        <dt class="text-muted-foreground">Responsable</dt>
        <dd class="break-words">
          {{ record.actor ?? "No disponible" }}
          @if (record.userId !== null) {
            · #USR-{{ record.userId }}
          }
        </dd>
        <dt class="text-muted-foreground">Correo del actor</dt>
        <dd class="break-words">{{ record.actorEmail ?? "No disponible" }}</dd>
        <dt class="text-muted-foreground">Acción</dt>
        <dd class="font-mono break-words">{{ record.action }}</dd>
        <dt class="text-muted-foreground">Entidad</dt>
        <dd class="font-mono break-words">{{ record.entity }}</dd>
        <dt class="text-muted-foreground">Registro</dt>
        <dd class="font-mono break-words">{{ record.recordId ?? "No disponible" }}</dd>
        <dt class="text-muted-foreground">IP / Origen</dt>
        <dd class="font-mono break-words">{{ record.ip ?? "No disponible" }}</dd>
      </dl>
      <h3 class="text-sm font-semibold">Detalles</h3>
      <p class="mt-2 text-sm whitespace-pre-wrap break-words">
        {{ record.details ?? "No disponible" }}
      </p>
      @if (record.changes?.length) {
        <h3 class="mt-4 text-sm font-semibold">Cambios registrados</h3>
        <div class="mt-2 flex flex-col gap-3">
          @for (change of record.changes; track $index) {
            <section class="rounded-lg border p-3" data-audit-change>
              <h4 class="text-sm font-semibold">{{ change.field }}</h4>
              <dl class="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt class="text-muted-foreground">Antes</dt>
                  <dd class="whitespace-pre-wrap break-words">
                    {{ change.before ?? "Sin valor" }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted-foreground">Después</dt>
                  <dd class="whitespace-pre-wrap break-words">{{ change.after ?? "Sin valor" }}</dd>
                </div>
              </dl>
            </section>
          }
        </div>
      } @else {
        <p class="mt-4 text-sm text-muted-foreground">
          Este registro no incluye valores antes/después.
        </p>
      }
    }
    <hlm-dialog-footer class="mt-4 border-t pt-3"
      ><button hlmBtn variant="outline" type="button" (click)="close()">
        Cerrar
      </button></hlm-dialog-footer
    >
  `
})
export class AuditDetail implements OnInit {
  readonly context = injectBrnDialogContext<AuditDetailContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly query = inject(GetAuditLogByIdUseCase)
  readonly log = signal<AuditLog | undefined>(undefined)
  readonly loading = signal(false)
  readonly error = signal("")
  constructor() {
    connectUserDialogDismissal(this.destroyRef, () => this.close())
  }
  ngOnInit(): void {
    this.retry()
  }
  retry(): void {
    if (this.destroyRef.destroyed || this.loading()) return
    this.loading.set(true)
    this.error.set("")
    defer(() => this.query.execute(this.context.logId))
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false))
      )
      .subscribe({
        next: result => {
          if (this.destroyRef.destroyed) return
          if (result.success) this.log.set(result.data)
          else this.error.set(result.error.message)
        },
        error: () => {
          if (!this.destroyRef.destroyed)
            this.error.set("No se pudo consultar el registro. Inténtalo de nuevo.")
        }
      })
  }
  close(): void {
    if (!this.destroyRef.destroyed && this.dialog.open) this.dialog.close()
  }
}
