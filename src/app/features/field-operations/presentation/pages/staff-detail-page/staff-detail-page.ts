import { isPlatformBrowser, Location } from "@angular/common"
import {
  Component,
  computed,
  DestroyRef,
  inject,
  Injector,
  PLATFORM_ID,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, Router, RouterLink } from "@angular/router"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import {
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  map,
  startWith,
  Subject,
  switchMap,
  takeUntil
} from "rxjs"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { FieldOperationsError } from "../../../domain/errors/field-operations.error"
import {
  staffPageContext,
  staffPagingParams,
  staffReturnFilters,
  staffReturnState,
  staffRouteId
} from "../../navigation/staff-page-context"
import { FieldStaffStore } from "../../state/field-staff.store"
import { StaffAccountLinkDialog } from "./staff-account-link-dialog/staff-account-link-dialog"
import { StaffAccountUnlinkDialog } from "./staff-account-unlink-dialog/staff-account-unlink-dialog"

type Target = { own: true } | { own: false; id: number | null }

@Component({
  selector: "app-staff-detail-page",
  imports: [
    RouterLink,
    CatalogFrame,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmEmptyImports,
    HlmSpinnerImports
  ],
  templateUrl: "./staff-detail-page.html"
})
export class StaffDetailPage {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly location = inject(Location)
  private readonly injector = inject(Injector)
  private readonly destroyRef = inject(DestroyRef)
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private readonly store = inject(FieldStaffStore)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  /** Emitted synchronously when the route owner changes, before the replacement data is selected. */
  private readonly ownerChanged = new Subject<void>()
  readonly ownerChanged$ = this.ownerChanged.asObservable()
  private accountDialog: BrnDialogRef | undefined
  private readonly navigationState = this.browser
    ? (this.router.currentNavigation()?.extras.state ?? this.location.getState())
    : undefined
  readonly target = signal<Target>({ own: false, id: null })
  private readonly params = signal(this.route.snapshot.queryParamMap)
  private readonly live = signal(false)
  private readonly admissionError = signal<FieldOperationsError | undefined>(undefined)
  private readonly scope = createSessionReadScope(() => {
    this.live.set(false)
    this.admissionError.set(undefined)
  })
  private readonly retries = new Subject<boolean>()
  readonly invalid = computed(() => {
    const target = this.target()
    return !target.own && target.id === null
  })
  readonly detail = computed(() => {
    if (!this.live()) return undefined
    const target = this.target()
    return target.own
      ? this.store.selectMyStaffProfile()
      : target.id === null
        ? undefined
        : this.store.selectStaffById(target.id)
  })
  readonly staff = computed(() => {
    const result = this.detail()?.result,
      target = this.target()
    return result && (target.own || result.id === target.id) ? result : undefined
  })
  readonly busy = computed(() => !!this.detail()?.loading || !!this.detail()?.refreshing)
  readonly error = computed(() => this.admissionError() ?? this.detail()?.error)
  /**
   * An authoritative absence, not a failure: repeating the same `GET` cannot produce the record, so
   * this state never offers a retry and never claims the data is merely stale.
   */
  readonly notFound = computed(() => this.error()?.code === "NOT_FOUND")
  readonly backContext = computed(() => staffPagingParams(staffPageContext(this.params())))
  readonly backState = computed(() => {
    if (!this.browser || !this.live()) return undefined
    const session = this.injector.get(AuthStore).session()
    const owner =
      session && typeof session.expiresAt === "number"
        ? {
            userId: session.id,
            sessionDeadline: session.expiresAt
          }
        : null
    return staffReturnState(staffReturnFilters(this.navigationState, owner), owner)
  })
  readonly fields = computed(() => {
    const staff = this.staff()
    return staff
      ? [
          ["ID de personal", staff.id],
          ["Documento", staff.document],
          ["Teléfono", staff.phone],
          ["Correo", staff.email],
          ["Idioma", staff.language],
          ["Fecha de ingreso", staff.joinedOn],
          ["Creación (UTC)", staff.createdAt.toISOString()]
        ]
      : []
  })
  readonly errorMessage = computed(() => {
    switch (this.error()?.code) {
      case "NOT_FOUND":
        return "No se encontró el perfil de personal."
      case "FORBIDDEN":
        return "No tienes permiso para consultar este perfil."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "INVALID_RESPONSE":
        return "La respuesta del servicio no es válida. Inténtalo de nuevo."
      case "UNCONFIGURED":
        return "El servicio de personal no está disponible en este entorno."
      default:
        return "No se pudo cargar el perfil. Inténtalo de nuevo."
    }
  })

  constructor() {
    this.destroyRef.onDestroy(() => this.accountDialog?.close())
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.params.set(params))
    combineLatest([this.route.paramMap, this.route.data])
      .pipe(
        map(([params, data]): Target =>
          data["ownStaffProfile"] === true
            ? { own: true }
            : { own: false, id: staffRouteId(params.get("id")) }
        ),
        distinctUntilChanged((a, b) => a.own === b.own && (a.own || b.own || a.id === b.id)),
        switchMap(target => {
          // The owner is replaced: queued dialogs and their feedback must not reach the new record.
          this.ownerChanged.next()
          this.target.set(target)
          this.admissionError.set(undefined)
          this.live.set(false)
          if ((!target.own && target.id === null) || !this.scope.check()) return EMPTY
          this.live.set(true)
          const generation = this.scope.generation()
          return this.retries.pipe(
            startWith(false),
            switchMap(force =>
              target.own
                ? this.store.observeMyStaffProfile(force)
                : this.store.observeStaffById(target.id!, force)
            ),
            takeUntil(this.scope.cancelled$),
            map(result => {
              if (this.destroyRef.destroyed || generation !== this.scope.generation()) return
              // Admission failures have no root entry. Keep only their safe error, never a result copy.
              result.either(
                () => this.admissionError.set(undefined),
                error => this.admissionError.set(this.detail()?.error ? undefined : error)
              )
            })
          )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }

  retry(): void {
    if (this.destroyRef.destroyed || this.invalid() || this.busy() || !this.scope.check()) return
    // A replaced session must re-enter through route navigation, not revive its detached observer.
    if (!this.live()) return
    this.admissionError.set(undefined)
    this.retries.next(true)
  }

  /** The only refresh a confirmed account write triggers: one fresh read of this exact record. */
  private readAfterWrite(): void {
    if (this.destroyRef.destroyed || this.invalid() || !this.live() || !this.scope.check()) return
    this.admissionError.set(undefined)
    this.retries.next(true)
  }

  private accountCurrent(): boolean {
    return !this.destroyRef.destroyed && this.live() && !this.invalid() && this.scope.check()
  }

  private openAccount(action: "link" | "unlink"): void {
    const staff = this.staff()
    if (!this.accountCurrent() || !staff || this.busy() || this.accountDialog?.open) return
    if (
      (action === "link" && staff.userId !== null) ||
      (action === "unlink" && staff.userId === null)
    )
      return
    const generation = this.scope.generation()
    const current = () => this.accountCurrent() && generation === this.scope.generation()
    const record = { id: staff.id, name: staff.name }
    const done = () => {
      if (!current()) return
      this.toast.success(
        action === "link" ? "Cuenta vinculada correctamente." : "Cuenta desvinculada correctamente."
      )
      if (!current()) return
      this.readAfterWrite()
    }
    const common = {
      owner: this.destroyRef,
      ownerChanged$: this.ownerChanged$,
      current
    }
    this.accountDialog =
      action === "link"
        ? this.dialogs.open(StaffAccountLinkDialog, {
            context: { ...common, staff: record, onLinked: done },
            showCloseButton: false,
            disableClose: true,
            contentClass: "sm:max-w-lg max-h-[90dvh] overflow-y-auto"
          })
        : this.dialogs.open(StaffAccountUnlinkDialog, {
            context: { ...common, staff: { ...record, userId: staff.userId! }, onUnlinked: done },
            showCloseButton: false,
            disableClose: true,
            contentClass: "sm:max-w-md"
          })
  }

  linkAccount(): void {
    this.openAccount("link")
  }

  unlinkAccount(): void {
    this.openAccount("unlink")
  }
}
