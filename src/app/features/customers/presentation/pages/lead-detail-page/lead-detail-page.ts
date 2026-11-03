import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, RouterLink } from "@angular/router"
import { distinctUntilChanged, EMPTY, map, startWith, Subject, switchMap } from "rxjs"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"
import { leadPageContext } from "../leads-page/lead-page-context"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { LeadEditor } from "../../components/lead-editor/lead-editor"

@Component({
  selector: "app-lead-detail-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CatalogFrame,
    HlmButtonImports,
    HlmAlertImports,
    HlmSpinnerImports,
    HlmBadgeImports
  ],
  templateUrl: "./lead-detail-page.html"
})
export class LeadDetailPage {
  private readonly route = inject(ActivatedRoute)
  private readonly destroyRef = inject(DestroyRef)
  private readonly acquisition = inject(CustomerAcquisitionStore)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private dialog: BrnDialogRef | undefined
  private readonly ownerChanged = new Subject<void>()
  private ownerRevision = 0
  private readonly scope = createSessionReadScope(() => this.dialog?.close())
  readonly writing = this.acquisition.writing
  readonly id = signal<number | null>(null)
  private readonly params = signal(this.route.snapshot.queryParamMap)
  readonly backContext = computed(() => leadPageContext(this.params()))
  private readonly selection = computed(() =>
    this.id() === null ? undefined : this.acquisition.selectLead(this.id()!)
  )
  readonly detail = computed(() => this.selection()?.())
  readonly lead = computed(() => {
    const entry = this.detail()
    return entry?.loaded && entry.data?.id === this.id() ? entry.data : undefined
  })
  private readonly retries = new Subject<boolean>()
  readonly profile = computed(() => {
    const lead = this.lead()
    return lead
      ? [
          ["ID", lead.id],
          ["Correo", lead.email],
          ["Teléfono", lead.phone],
          ["Origen (ID)", lead.originId],
          ["Etapa (ID)", lead.stageId],
          ["Dirección de referencia", lead.referenceAddress],
          ["Registro (UTC)", lead.registeredAt.toISOString()],
          ["Registrado por (ID)", lead.registeredByUserId]
        ]
      : []
  })
  readonly errorMessage = computed(() => {
    switch (this.detail()?.error?.code) {
      case "LEAD_NOT_FOUND":
      case "NOT_FOUND":
        return "No se encontró el prospecto."
      case "FORBIDDEN":
        return "No tienes permiso para consultar este prospecto."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNCONFIGURED":
        return "El servicio de prospectos no está disponible en este entorno."
      default:
        return "No se pudo cargar el prospecto. Inténtalo de nuevo."
    }
  })

  constructor() {
    this.destroyRef.onDestroy(() => this.dialog?.close())
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.params.set(params))
    this.route.paramMap
      .pipe(
        map(params => {
          const text = params.get("id") ?? "",
            id = Number(text)
          return /^\d+$/.test(text) && Number.isSafeInteger(id) && id > 0 && id <= 2147483647
            ? id
            : null
        }),
        distinctUntilChanged(),
        switchMap(id => {
          // Cancel the captured editor before selecting any replacement owner's data.
          this.ownerRevision++
          this.ownerChanged.next()
          this.dialog?.close()
          this.id.set(id)
          // Route replacement releases the old observer; root state owns TTL/session/SSR fencing.
          return id === null || !this.scope.check()
            ? EMPTY
            : this.retries.pipe(
                startWith(false),
                switchMap(force => this.acquisition.observeLead(id, force))
              )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }

  edit(): void {
    const lead = this.lead()
    if (
      !lead ||
      lead.id !== this.id() ||
      !this.scope.check() ||
      this.destroyRef.destroyed ||
      this.writing() ||
      this.dialog?.open
    )
      return
    const generation = this.scope.generation(),
      revision = this.ownerRevision
    const current = () =>
      !this.destroyRef.destroyed &&
      revision === this.ownerRevision &&
      this.id() === lead.id &&
      this.scope.check() &&
      generation === this.scope.generation() &&
      !!this.dialog?.open
    this.dialog = this.dialogs.open(LeadEditor, {
      context: {
        lead,
        owner: this.destroyRef,
        ownerChanged$: this.ownerChanged.asObservable(),
        current,
        onSaved: () => {
          if (current()) this.toast.success("Prospecto actualizado correctamente.")
          // Existing root observers revalidate detail and active inboxes; do not reload twice.
        }
      },
      showCloseButton: false,
      disableClose: true,
      contentClass: "sm:max-w-lg"
    })
  }

  retry(): void {
    if (
      !this.destroyRef.destroyed &&
      this.id() !== null &&
      !this.detail()?.loading &&
      !this.detail()?.refreshing
    )
      this.retries.next(true)
  }
}
