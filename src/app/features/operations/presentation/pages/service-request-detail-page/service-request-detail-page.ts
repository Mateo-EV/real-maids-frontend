import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { DEFAULT_DIALOG_CONFIG, Dialog, DialogConfig } from "@angular/cdk/dialog"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import {
  ActivatedRoute,
  NavigationStart,
  PRIMARY_OUTLET,
  Router,
  RouterLink
} from "@angular/router"
import { distinctUntilChanged, EMPTY, map, startWith, Subject, switchMap } from "rxjs"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { BrnDialogRef, BrnDialogService } from "@spartan-ng/brain/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import {
  ServiceRequestEditor,
  ServiceRequestEditorContext
} from "../../components/service-request-editor/service-request-editor"
import {
  ServiceRequestCancelContext,
  ServiceRequestCancelDialog
} from "../../components/service-request-cancel-dialog/service-request-cancel-dialog"
import {
  serviceRequestPageContext,
  serviceRequestPagingParams,
  serviceRequestRouteId
} from "../../navigation/service-request-page-context"
import { ServiceRequestsStore } from "../../state/service-requests.store"
import { ServiceOrdersStore } from "../../state/service-orders.store"
import {
  ServiceOrderCreateContext,
  ServiceOrderCreateDialog
} from "../../components/service-order-create-dialog/service-order-create-dialog"

@Component({
  // This page owns navigation dismissal. Keep CDK history disposal from
  // bypassing its same-request check, without changing other dialogs.
  providers: [
    HlmDialogService,
    BrnDialogService,
    Dialog,
    {
      provide: DEFAULT_DIALOG_CONFIG,
      useFactory: () => ({
        ...new DialogConfig(),
        ...inject(DEFAULT_DIALOG_CONFIG, { optional: true, skipSelf: true }),
        closeOnNavigation: false
      })
    }
  ],
  imports: [
    RouterLink,
    CatalogFrame,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmSpinnerImports
  ],
  selector: "app-service-request-detail-page",
  templateUrl: "./service-request-detail-page.html"
})
export class ServiceRequestDetailPage {
  private readonly route = inject(ActivatedRoute)
  private readonly destroyRef = inject(DestroyRef)
  private readonly requests = inject(ServiceRequestsStore)
  private readonly orders = inject(ServiceOrdersStore)
  readonly creatingOrder = this.orders.writing
  readonly createdOrderId = signal<number | null>(null)
  private readonly router = inject(Router)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private readonly ownerChanged = new Subject<void>()
  private revision = 0
  private departing = false
  private dialog: BrnDialogRef | undefined
  private dialogIdentity: object | undefined
  private readonly scope = createSessionReadScope(() => this.stopEditor())
  readonly writing = this.requests.writing
  private readonly retries = new Subject<boolean>()
  private readonly params = signal(this.route.snapshot.queryParamMap)
  readonly id = signal<number | null>(null)
  readonly backContext = computed(() =>
    serviceRequestPagingParams(serviceRequestPageContext(this.params()))
  )
  readonly detail = computed(() => {
    const id = this.id()
    return id === null ? undefined : this.requests.selectRequest(id)
  })
  readonly request = computed(() => {
    const result = this.detail()?.result
    return result?.id === this.id() ? result : undefined
  })
  readonly profile = computed(() => {
    const request = this.request()
    return request
      ? [
          ["Solicitud (ID)", request.id],
          ["Cliente", request.customerName],
          ["Cliente (ID)", request.customerId],
          ["Propiedad", request.propertyName],
          ["Propiedad (ID)", request.propertyId],
          ["Tipo de servicio", request.serviceTypeName],
          ["Tipo de servicio (ID)", request.serviceTypeId],
          ["Fecha deseada", request.desiredDate],
          ["Registrado por", request.registeredByName],
          ["Registro (UTC)", request.registeredAt.toISOString()],
          ["Última actualización (UTC)", request.updatedAt?.toISOString() ?? null]
        ]
      : []
  })
  readonly errorMessage = computed(() => {
    switch (this.detail()?.error?.code) {
      case "NOT_FOUND":
        return "No se encontró la solicitud."
      case "FORBIDDEN":
        return "No tienes permiso para consultar esta solicitud."
      case "INVALID_RESPONSE":
        return "La respuesta del servicio no es válida. Reintenta la consulta."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNCONFIGURED":
      case "UNAVAILABLE":
        return "El servicio de solicitudes no está disponible en este momento."
      default:
        return "No se pudo cargar la solicitud. Inténtalo de nuevo."
    }
  })

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopEditor()
      this.ownerChanged.complete()
    })
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (!(event instanceof NavigationStart)) return
      const segments = this.router.parseUrl(event.url).root.children[PRIMARY_OUTLET]?.segments
      // Return paging is not request identity: same-ID query updates must not
      // close the overlay, discard the draft or restart its reads.
      const sameOwner =
        segments?.length === 4 &&
        segments[0].path === "admin" &&
        segments[1].path === "operations" &&
        segments[2].path === "requests" &&
        serviceRequestRouteId(segments[3].path) === this.id()
      if (sameOwner) return
      this.departing = true
      this.stopEditor()
    })
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.params.set(params))
    this.route.paramMap
      .pipe(
        map(params => serviceRequestRouteId(params.get("id"))),
        distinctUntilChanged(),
        switchMap(id => {
          // Cancel the old editor synchronously before selecting the new ID or
          // allowing its replacement transport to start.
          this.stopEditor()
          this.departing = false
          this.id.set(id)
          // Only route identity or explicit retry starts an observation. The root
          // store cancels session-old work without restarting it for a new session.
          return id === null
            ? EMPTY
            : this.retries.pipe(
                startWith(false),
                switchMap(force => this.requests.observeRequest(id, force))
              )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }

  private stopEditor(): void {
    this.createdOrderId.set(null)
    const dialog = this.dialog
    this.dialog = undefined
    this.revision++
    this.dialogIdentity = undefined
    this.ownerChanged.next()
    // The component-scoped dialog cannot schedule an exit render after its
    // injector's view is destroyed. Dispose synchronously only at teardown.
    if (this.destroyRef.destroyed) dialog?.forceClose()
    else dialog?.close()
  }

  edit(): void {
    const selected = this.request()
    if (
      this.destroyRef.destroyed ||
      this.departing ||
      !selected ||
      selected.id !== this.id() ||
      selected.status !== "registrada" ||
      this.writing() ||
      !this.scope.check() ||
      this.dialog?.open
    )
      return
    const request = { ...selected }
    const revision = this.revision
    const generation = this.scope.generation()
    const identity = {}
    this.dialogIdentity = identity
    const current = () =>
      !this.destroyRef.destroyed &&
      !this.departing &&
      this.dialogIdentity === identity &&
      revision === this.revision &&
      request.id === this.id() &&
      this.scope.check() &&
      generation === this.scope.generation() &&
      !!this.dialog?.open
    const context: ServiceRequestEditorContext = {
      owner: this.destroyRef,
      request,
      ownerChanged$: this.ownerChanged.asObservable(),
      current,
      onSaved: () => {
        if (current()) this.toast.success("Solicitud actualizada correctamente.")
      }
    }
    this.dialog = this.dialogs.open(ServiceRequestEditor, {
      context,
      disableClose: true,
      showCloseButton: false,
      contentClass: "sm:max-w-xl max-h-[90dvh] overflow-y-auto"
    })
  }

  cancelRequest(): void {
    const selected = this.request()
    if (
      this.destroyRef.destroyed ||
      this.departing ||
      !selected ||
      selected.id !== this.id() ||
      selected.status !== "registrada" ||
      this.writing() ||
      !this.scope.check() ||
      this.dialog?.open
    )
      return
    const request = { ...selected }
    const revision = this.revision
    const generation = this.scope.generation()
    const identity = {}
    this.dialogIdentity = identity
    const current = () =>
      !this.destroyRef.destroyed &&
      !this.departing &&
      this.dialogIdentity === identity &&
      revision === this.revision &&
      request.id === this.id() &&
      this.scope.check() &&
      generation === this.scope.generation() &&
      !!this.dialog?.open
    const context: ServiceRequestCancelContext = {
      request,
      owner: this.destroyRef,
      ownerChanged$: this.ownerChanged.asObservable(),
      current,
      onCancelled: () => {
        if (current()) this.toast.success("Solicitud cancelada correctamente.")
      }
    }
    this.dialog = this.dialogs.open(ServiceRequestCancelDialog, {
      context,
      disableClose: true,
      showCloseButton: false,
      contentClass: "sm:max-w-xl max-h-[90dvh] overflow-y-auto"
    })
  }

  createOrder(): void {
    const selected = this.request()
    if (
      this.destroyRef.destroyed ||
      this.departing ||
      !selected ||
      selected.id !== this.id() ||
      selected.status !== "registrada" ||
      this.writing() ||
      this.creatingOrder() ||
      !this.scope.check() ||
      this.dialog?.open
    )
      return
    const request = { ...selected }
    const revision = this.revision
    const generation = this.scope.generation()
    const identity = {}
    this.dialogIdentity = identity
    const current = () =>
      !this.destroyRef.destroyed &&
      !this.departing &&
      this.dialogIdentity === identity &&
      revision === this.revision &&
      request.id === this.id() &&
      this.scope.check() &&
      generation === this.scope.generation() &&
      !!this.dialog?.open
    const context: ServiceOrderCreateContext = {
      requestId: request.id,
      customerId: request.customerId,
      customerName: request.customerName,
      owner: this.destroyRef,
      ownerChanged$: this.ownerChanged.asObservable(),
      current,
      onCreated: orderId => {
        if (!current()) return
        this.toast.success("Orden creada correctamente.")
        // Toast callbacks may synchronously replace the owner/session.
        if (current()) this.createdOrderId.set(orderId)
      }
    }
    this.dialog = this.dialogs.open(ServiceOrderCreateDialog, {
      context,
      disableClose: true,
      showCloseButton: false,
      contentClass: "sm:max-w-xl max-h-[90dvh] overflow-y-auto"
    })
  }

  retry(): void {
    if (
      this.destroyRef.destroyed ||
      this.id() === null ||
      this.detail()?.loading ||
      this.detail()?.refreshing
    )
      return
    this.retries.next(true)
  }
}
