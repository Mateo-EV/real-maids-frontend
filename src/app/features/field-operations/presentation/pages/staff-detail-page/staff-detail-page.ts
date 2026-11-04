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
          ["Usuario vinculado (ID)", staff.userId],
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
}
