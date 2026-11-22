import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { firstValueFrom, Observable, Subscription, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmDialogDescription, HlmDialogHeader, HlmDialogTitle } from "@spartan-ng/helm/dialog"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { FIELD_STAFF_ROLE_NAME } from "@/app/features/auth/presentation/routing/audience-navigation"
import { LinkStaffAccountUseCase } from "../../../../application/use-cases/field-staff.use-cases"
import { FieldOperationsErrorCode } from "../../../../domain/errors/field-operations.error"
import { User } from "@/app/features/users/domain/entities/user.entity"
import { UserListQuery } from "@/app/features/users/domain/models/user-list-query"
import { RolesStore } from "@/app/features/users/presentation/state/roles.store"
import { UserStore } from "@/app/features/users/presentation/state/user.store"
import { FieldStaffStore } from "../../../state/field-staff.store"

/** One page of eligible accounts, like every other paginated read of the application. */
const PAGE_SIZE = 10
/**
 * The staff directory read that tells which accounts already own a record. `PersonalResponse` is
 * the only place that exposes the link and it has no reverse filter, so this is one bounded page
 * (the documented backend maximum) instead of a download; anything beyond it stays unmarked and
 * the server's `409` remains authoritative. It can only under-mark, never wrongly disable.
 */
const LINKAGE_PAGE_SIZE = 100

export interface StaffAccountLinkContext {
  readonly staff: { readonly id: number; readonly name: string }
  readonly owner: DestroyRef
  readonly ownerChanged$: Observable<void>
  readonly current: () => boolean
  /** Confirmed success: the owner emits one message and forces exactly one fresh read. */
  readonly onLinked: () => void
}

/** Project-owned copy: the message carried by the response never reaches the user. */
export function staffAccountLinkError(code: FieldOperationsErrorCode): string {
  switch (code) {
    case "INVALID_DATA":
      return "El servidor rechazó la cuenta elegida. Solo se vincula una cuenta con rol PERSONAL_CAMPO."
    case "FORBIDDEN":
      return "No tienes permiso para vincular la cuenta de este colaborador."
    case "CONFLICT":
      return "La cuenta ya está vinculada a otra ficha de personal. Elige otra cuenta."
    case "NOT_FOUND":
      return "La ficha o la cuenta ya no está disponible. Actualiza la ficha antes de reintentar."
    case "UNAUTHENTICATED":
      return "La sesión no está disponible. Vuelve a iniciar sesión."
    case "UNCONFIGURED":
      return "El servicio de personal no está disponible en este entorno."
    case "UNAVAILABLE":
      return "No se pudo conectar. Puedes reintentar cuando la conexión vuelva."
    default:
      return "No se pudo confirmar la vinculación. Actualiza la ficha antes de reintentar; la operación pudo haberse aplicado."
  }
}

/**
 * WP11 S2–S3/S5 — links an existing account of role `PERSONAL_CAMPO` to the staff record.
 *
 * The selector reads the real users collection through the root `UserStore` with the documented
 * server filters (`idRol` of `PERSONAL_CAMPO` and `activo`), paged on the server. It never creates a
 * second store, never asks for the whole catalogue to filter it here and never guesses an account:
 * the chosen id comes from the verified page. Accounts that already own a staff record are marked
 * unavailable with their reason from one bounded staff read, because the staff response is the only
 * contract exposing the link.
 */
@Component({
  selector: "app-staff-account-link-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmAlertImports,
    HlmButtonImports,
    HlmDialogDescription,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmEmptyImports,
    HlmSpinnerImports
  ],
  templateUrl: "./staff-account-link-dialog.html"
})
export class StaffAccountLinkDialog {
  readonly context = injectBrnDialogContext<StaffAccountLinkContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly roles = inject(RolesStore)
  private readonly users = inject(UserStore)
  private readonly staff = inject(FieldStaffStore)
  private readonly link = inject(LinkStaffAccountUseCase)
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set("La sesión no está disponible. Vuelve a iniciar sesión.")
  )
  private readonly query = signal<UserListQuery | undefined>(undefined)
  private readonly linked = signal<ReadonlySet<number>>(new Set())
  private readonly started = signal(false)
  private request?: Subscription
  private roleRequest?: Subscription
  private indexRequest?: Subscription
  private ended = false
  readonly error = signal("")
  readonly saving = signal(false)
  readonly selection = signal<number | undefined>(undefined)
  readonly linkageError = signal(false)
  readonly pending = this.saving.asReadonly()
  readonly roleId = computed(
    () => this.roles.roles().find(role => role.name.trim() === FIELD_STAFF_ROLE_NAME)?.id
  )
  readonly rolesLoading = computed(() => !this.roles.loaded() && !this.roles.error())
  readonly rolesError = computed(() => this.roles.error() !== undefined)
  readonly roleMissing = computed(
    () => this.roles.loaded() && !this.roles.error() && !this.roleId()
  )
  readonly page = this.users.selectQuery(
    computed(() => this.query() ?? { offset: 0, limit: PAGE_SIZE })
  )
  readonly rows = computed<User[]>(() => {
    const page = this.page
    return page.loaded() ? (page.result()?.items ?? []) : []
  })
  readonly pageNumber = computed(() => {
    const query = this.page.query()
    return (query.offset ?? 0) / (query.limit ?? PAGE_SIZE) + 1
  })
  readonly pageCount = computed(() => {
    const result = this.page.result()
    return Math.max(1, result ? Math.ceil(result.total / result.limit) : 1)
  })
  readonly canGoBack = computed(() => this.pageNumber() > 1 && !this.pending())
  readonly canGoForward = computed(() => this.pageNumber() < this.pageCount() && !this.pending())
  readonly accountsError = computed(() => this.page.error() !== undefined)
  readonly accountsLoading = computed(() => this.page.loading() && !this.page.loaded())
  readonly selectable = computed(() => this.page.loaded() && !this.page.error() && !this.pending())
  readonly selected = computed(() =>
    this.rows().find(user => user.id === this.selection() && !this.unavailable(user))
  )

  constructor() {
    this.loadRoles()
    effect(() => {
      const roleId = this.roleId()
      if (!roleId || this.started()) return
      untracked(() => {
        this.started.set(true)
        this.loadPage({ offset: 0, limit: PAGE_SIZE, roleId, isActive: true })
        this.loadLinkageIndex()
      })
    })
  }

  /** Stored, not re-read: an account linked to another record cannot be chosen. */
  unavailable(user: User): boolean {
    return this.linked().has(user.id)
  }

  private current(): boolean {
    return (
      !this.ended &&
      !this.destroyRef.destroyed &&
      this.context.current() &&
      this.lifecycle.current() &&
      this.dialog.open
    )
  }

  private fenced<T>(source: Observable<T>): Observable<T> {
    return source.pipe(
      takeUntil(this.context.ownerChanged$),
      takeUntil(this.lifecycle.cancelled$),
      takeUntilDestroyed(this.destroyRef)
    )
  }

  loadRoles(force = false): void {
    this.roleRequest?.unsubscribe()
    this.roleRequest = this.fenced(this.roles.loadRoles(force)).subscribe()
  }

  private loadLinkageIndex(force = false): void {
    this.indexRequest?.unsubscribe()
    this.linkageError.set(false)
    this.indexRequest = this.fenced(
      this.staff.readStaff({ offset: 0, limit: LINKAGE_PAGE_SIZE }, force)
    ).subscribe(result => {
      if (!this.current()) return
      result.either(
        page =>
          this.linked.set(
            new Set(page.items.map(item => item.userId).filter((id): id is number => id !== null))
          ),
        () => this.linkageError.set(true)
      )
    })
  }

  retryLinkage(): void {
    if (this.pending()) return
    this.loadLinkageIndex(true)
  }

  private loadPage(query: UserListQuery, delay = 0, force = false): void {
    if (this.ended) return
    this.request?.unsubscribe()
    this.query.set(query)
    const request = new Subscription()
    this.request = request
    request.add(this.fenced(this.users.observeQuery(query, delay, force)).subscribe())
  }

  search(value: string): void {
    if (!this.current() || this.pending()) return
    const query = this.page.query()
    if (!query.roleId) return
    const search = value.trim()
    this.selection.set(undefined)
    this.loadPage(
      {
        offset: 0,
        limit: query.limit ?? PAGE_SIZE,
        roleId: query.roleId,
        isActive: true,
        ...(search ? { search } : {})
      },
      search ? 250 : 0
    )
  }

  goToPage(page: number): void {
    if (!this.current() || this.pending() || !this.selectable()) return
    if (!Number.isSafeInteger(page) || page < 1 || page > this.pageCount()) return
    const query = this.page.query()
    if (!query.roleId || page === this.pageNumber()) return
    this.selection.set(undefined)
    this.loadPage({ ...query, offset: (page - 1) * (query.limit ?? PAGE_SIZE) })
  }

  retryAccounts(): void {
    if (this.pending()) return
    const query = this.page.query()
    if (!query.roleId) {
      this.loadRoles(true)
      return
    }
    this.loadPage(query, 0, true)
  }

  readonly select = (id: number): void => {
    if (!this.selectable() || !this.current()) return
    const user = this.rows().find(row => row.id === id)
    if (!user || this.unavailable(user)) return
    this.selection.set(id)
  }

  async save(): Promise<boolean> {
    if (!this.current() || this.pending()) return false
    const user = this.selected()
    if (!user) {
      this.error.set("Elige una cuenta disponible de la lista verificada.")
      return false
    }
    this.error.set("")
    this.saving.set(true)
    try {
      const result = await firstValueFrom(
        this.fenced(this.link.execute(this.context.staff.id, { userId: user.id })),
        { defaultValue: undefined }
      )
      if (!this.current() || !result) return false
      if (!result.success) {
        this.error.set(staffAccountLinkError(result.error.code))
        return false
      }
      this.context.onLinked()
      if (this.current()) this.dialog.close()
      return true
    } catch {
      if (this.current()) this.error.set(staffAccountLinkError("UNKNOWN"))
      return false
    } finally {
      if (!this.destroyRef.destroyed) this.saving.set(false)
    }
  }

  cancel(): void {
    if (!this.destroyRef.destroyed && !this.pending() && this.dialog.open) this.dialog.close()
  }
}
