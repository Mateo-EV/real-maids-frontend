import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, RouterLink } from "@angular/router"
import {
  EMPTY,
  Subject,
  distinctUntilChanged,
  map,
  merge,
  startWith,
  switchMap,
  takeUntil,
  tap
} from "rxjs"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CustomersStore } from "../../state/customers.store"
import { CustomerPropertiesStore } from "../../state/customer-properties.store"
import { customerPageContext } from "../customers-page/customer-page-context"
import { Property } from "../../../domain/entities/property.entity"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { PropertyEditor } from "../../components/property-editor/property-editor"
import { PropertyStatusDialog } from "../../components/property-status-dialog/property-status-dialog"

@Component({
  selector: "app-customer-detail-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CatalogFrame,
    HlmButtonImports,
    HlmBadgeImports,
    HlmAlertImports,
    HlmEmptyImports,
    HlmSpinnerImports
  ],
  templateUrl: "./customer-detail-page.html"
})
export class CustomerDetailPage {
  private readonly route = inject(ActivatedRoute)
  private readonly customers = inject(CustomersStore)
  private readonly properties = inject(CustomerPropertiesStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private dialog: BrnDialogRef | undefined
  private readonly ownerChanged = new Subject<void>()
  readonly writePending = computed(() => this.properties.pendingWrites() > 0)
  private readonly scope = createSessionReadScope(() => {
    this.openProperties.set(new Set())
    this.dialog?.close()
  })
  readonly id = signal<number | null>(null)
  readonly backContext = computed(() => customerPageContext(this.queryParams()))
  private readonly queryParams = signal(this.route.snapshot.queryParamMap)
  readonly detail = computed(() =>
    this.id() === null ? undefined : this.customers.selectCustomer(this.id()!)
  )
  readonly customer = computed(() => this.detail()?.result)
  readonly propertyRead = computed(() =>
    this.customer()?.id === this.id() ? this.properties.selectProperties(this.id()!) : undefined
  )
  readonly openProperties = signal<ReadonlySet<number>>(new Set())
  private readonly customerRetries = new Subject<boolean>()
  private readonly propertyRetries = new Subject<boolean>()
  readonly profile = computed(() => {
    const c = this.customer()
    return c
      ? [
          ["ID", c.id],
          ["Tipo", c.type === "residencial" ? "Residencial" : "Comercial"],
          ["Correo", c.email],
          ["Teléfono", c.phone],
          ["Identificación fiscal", c.taxIdentification],
          ["Origen del sistema", c.systemOrigin],
          ["ID externo", c.externalId],
          ["ID de cuenta", c.userId],
          ["ID de lead", c.leadId],
          ["Registrado por (ID)", c.registeredByUserId],
          ["Registro (UTC)", c.createdAt.toISOString()],
          ["Actualización (UTC)", c.updatedAt?.toISOString()]
        ]
      : []
  })

  constructor() {
    this.destroyRef.onDestroy(() => this.dialog?.close())
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe(params => this.queryParams.set(params))
    this.route.paramMap
      .pipe(
        map(params => params.get("id")),
        distinctUntilChanged(),
        switchMap(raw => {
          const id = Number(raw)
          const valid =
            /^\d+$/.test(raw ?? "") && Number.isSafeInteger(id) && id > 0 && id <= 2147483647
          this.ownerChanged.next()
          this.dialog?.close()
          this.id.set(valid ? id : null)
          this.openProperties.set(new Set())
          if (!valid || !this.scope.check()) return EMPTY
          let propertiesStarted = false
          return merge(
            this.propertyRetries.pipe(
              switchMap(force => this.properties.loadProperties(id, force))
            ),
            this.customerRetries.pipe(
              startWith(false),
              switchMap(force => this.customers.observeCustomer(id, force)),
              tap(result => {
                if (result.success && result.data.id === id && !propertiesStarted) {
                  propertiesStarted = true
                  this.propertyRetries.next(false)
                }
              })
            )
          ).pipe(takeUntil(this.scope.cancelled$))
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }

  editProperty(property: Property | null = null): void {
    const customer = this.customer()
    if (
      !customer ||
      customer.id !== this.id() ||
      !this.scope.check() ||
      this.destroyRef.destroyed ||
      this.writePending() ||
      this.dialog?.open
    )
      return
    if (
      property &&
      (property.customerId !== customer.id ||
        !this.propertyRead()?.loaded ||
        !this.propertyRead()?.data.includes(property))
    )
      return
    const generation = this.scope.generation()
    const current = () =>
      !this.destroyRef.destroyed &&
      this.id() === customer.id &&
      this.scope.check() &&
      generation === this.scope.generation()
    this.dialog = this.dialogs.open(PropertyEditor, {
      context: {
        customerId: customer.id,
        customerName: customer.name,
        property,
        owner: this.destroyRef,
        ownerChanged$: this.ownerChanged.asObservable(),
        current,
        onSaved: () => {
          if (!current()) return
          this.toast.success(
            property ? "Propiedad actualizada correctamente." : "Propiedad creada correctamente."
          )
          // Unlike CustomersStore observers, property reads are finite: revalidate exactly once.
          if (current()) this.propertyRetries.next(true)
        }
      },
      showCloseButton: false,
      disableClose: true,
      contentClass: "sm:max-w-2xl max-h-[90dvh] overflow-y-auto"
    })
  }

  changePropertyStatus(property: Property, isActive: boolean): void {
    const customer = this.customer()
    if (
      !customer ||
      customer.id !== this.id() ||
      property.customerId !== customer.id ||
      !this.propertyRead()?.loaded ||
      !this.propertyRead()?.data.includes(property) ||
      !this.scope.check() ||
      this.destroyRef.destroyed ||
      this.writePending() ||
      this.dialog?.open
    )
      return
    const generation = this.scope.generation()
    const current = () =>
      !this.destroyRef.destroyed &&
      this.id() === customer.id &&
      this.scope.check() &&
      generation === this.scope.generation()
    this.dialog = this.dialogs.open(PropertyStatusDialog, {
      context: {
        customerId: customer.id,
        customerName: customer.name,
        property,
        isActive,
        owner: this.destroyRef,
        ownerChanged$: this.ownerChanged.asObservable(),
        current,
        onChanged: () => {
          if (!current()) return
          this.toast.success(
            isActive ? "Propiedad activada correctamente." : "Propiedad desactivada correctamente."
          )
          if (current()) this.propertyRetries.next(true)
        }
      },
      showCloseButton: false,
      disableClose: true,
      contentClass: "sm:max-w-lg max-h-[90dvh] overflow-y-auto"
    })
  }

  retryCustomer(): void {
    if (this.scope.check()) this.customerRetries.next(true)
  }
  retryProperties(): void {
    if (this.customer()?.id === this.id() && this.scope.check()) this.propertyRetries.next(true)
  }
  toggleProperty(id: number, event: Event): void {
    const target = event.target as HTMLDetailsElement
    if (!target.isConnected || !this.scope.check()) return
    const open = target.open
    this.openProperties.update(current => {
      const next = new Set(current)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })
  }
  propertyFields(p: Property) {
    return [
      ["ID", p.id],
      ["Ciudad", p.city],
      ["Región", p.region],
      ["Código postal", p.postalCode],
      ["Superficie", p.areaM2 === null ? null : `${p.areaM2} m²`],
      ["Habitaciones", p.roomCount],
      ["Baños", p.bathroomCount],
      ["Mascotas", p.hasPets ? "Sí" : "No"],
      ["Registro (UTC)", p.createdAt.toISOString()]
    ]
  }
}
