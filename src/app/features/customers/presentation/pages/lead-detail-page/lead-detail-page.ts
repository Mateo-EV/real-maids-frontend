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
  readonly id = signal<number | null>(null)
  private readonly params = signal(this.route.snapshot.queryParamMap)
  readonly backContext = computed(() => leadPageContext(this.params()))
  private readonly selection = computed(() =>
    this.id() === null ? undefined : this.acquisition.selectLead(this.id()!)
  )
  readonly detail = computed(() => this.selection()?.())
  readonly lead = computed(() => this.detail()?.data)
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
          this.id.set(id)
          // Route replacement releases the old observer; root state owns TTL/session/SSR fencing.
          return id === null
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
