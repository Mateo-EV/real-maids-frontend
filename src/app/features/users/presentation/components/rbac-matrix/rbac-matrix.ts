import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  signal,
  untracked
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { FormField, FormRoot, disabled, form } from "@angular/forms/signals"
import { forkJoin, Subscription } from "rxjs"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmCardImports } from "@spartan-ng/helm/card"
import { HlmCheckboxImports } from "@spartan-ng/helm/checkbox"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import {
  Permission,
  PermissionAssignment,
  copyAssignment
} from "../../../domain/entities/permission.entity"
import { RolesStore } from "../../state/roles.store"
import { RbacStore } from "../../state/rbac.store"
import { RbacSaveConfirmation, RbacSaveContext } from "./rbac-save-confirmation"
@Component({
  selector: "app-rbac-matrix",
  imports: [
    FormRoot,
    FormField,
    HlmButtonImports,
    HlmCardImports,
    HlmCheckboxImports,
    HlmNativeSelectImports,
    HlmFieldImports,
    HlmAlertImports,
    HlmSpinnerImports,
    HlmEmptyImports
  ],
  templateUrl: "./rbac-matrix.html"
})
export class RbacMatrix implements OnInit {
  readonly roles = inject(RolesStore)
  private readonly store = inject(RbacStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  readonly active = input(true)
  // Snapshot of the editable draft baseline, not a read cache.
  readonly selectedRoleId = signal<number | undefined>(undefined)
  readonly loaded = signal<PermissionAssignment | undefined>(undefined)
  readonly loadedRoleId = computed(() => this.loaded()?.roleId)
  readonly displayedRole = computed(() =>
    this.roles.roles().find(role => role.id === this.loadedRoleId())
  )
  readonly catalog = computed(() => this.store.catalog())
  private readonly draftPermissions = signal<Permission[]>([])
  readonly permissions = computed(() => {
    const all = new Map(this.catalog().map(permission => [permission.id, permission]))
    // Preserve and display assigned IDs absent from the current catalog; never silently revoke them.
    for (const permission of [
      ...(this.loaded()?.permissions ?? []),
      ...this.draftPermissions().filter(p => this.model()[this.key(p.id)])
    ])
      if (!all.has(permission.id)) all.set(permission.id, permission)
    return [...all.values()]
  })
  readonly modules = computed(() =>
    [...new Set(this.permissions().map(p => p.module))].map(module => ({
      name: module,
      permissions: this.permissions().filter(p => p.module === module)
    }))
  )
  readonly model = signal<Record<string, boolean>>({})
  readonly matrixForm = form(this.model, path => disabled(path, () => !this.editable()))
  readonly ids = computed(() =>
    this.permissions()
      .filter(p => this.model()[this.key(p.id)])
      .map(p => p.id)
  )
  readonly refreshing = computed(
    () =>
      this.store.catalogEntry().refreshing ||
      !!this.store.assignmentEntries()[this.selectedRoleId()!]?.refreshing
  )
  readonly loading = computed(
    () =>
      this.store.catalogEntry().loading ||
      !!this.store.assignmentEntries()[this.selectedRoleId()!]?.loading ||
      this.refreshing()
  )
  readonly confirmationOpen = signal(false)
  readonly error = computed(() =>
    this.store.catalogEntry().error || this.store.assignmentEntries()[this.selectedRoleId()!]?.error
      ? "No pudimos cargar los permisos. Los cambios visibles se conservan; reintenta para continuar."
      : ""
  )
  readonly dirty = computed(() => {
    const saved = this.loaded()?.permissions.map(p => p.id) ?? []
    return saved.length !== this.ids().length || this.ids().some(id => !saved.includes(id))
  })
  readonly editable = computed(
    () =>
      !!this.loaded() &&
      !!this.displayedRole() &&
      this.loadedRoleId() === this.selectedRoleId() &&
      !this.loading() &&
      !this.error() &&
      !this.confirmationOpen()
  )
  readonly canSave = computed(() => this.editable() && this.dirty())
  private request?: Subscription
  private generation = 0
  private releaseRole?: () => void
  private sessionRevision = this.store.sessionRevision()
  constructor() {
    effect(() => {
      const revision = this.store.sessionRevision()
      untracked(() => {
        if (revision !== this.sessionRevision) {
          this.sessionRevision = revision
          this.releaseRole?.()
          this.releaseRole = undefined
          this.loaded.set(undefined)
          this.model.set({})
          this.draftPermissions.set([])
        }
      })
    })
    let wasActive: boolean | undefined
    effect(() => {
      const active = this.active()
      const revisiting = wasActive === false && active
      wasActive = active
      // ngOnInit owns the initial read; only a later visibility edge checks freshness.
      if (revisiting)
        untracked(() => {
          if (this.selectedRoleId() !== undefined) this.load(false)
        })
    })
    this.destroyRef.onDestroy(() => this.releaseRole?.())
  }
  key(id: number): string {
    return `permission${id}`
  }
  inCatalog(id: number): boolean {
    return this.catalog().some(p => p.id === id)
  }
  ngOnInit(): void {
    this.selectedRoleId.set(this.roles.roles()[0]?.id)
    this.load(false)
  }
  selectRole(value: string | null | undefined): void {
    if (this.destroyRef.destroyed || this.confirmationOpen() || value == null || value === "")
      return
    const id = Number(value)
    if (!this.roles.roles().some(role => role.id === id)) return
    this.selectedRoleId.set(id)
    this.load(false)
  }
  retry(): void {
    this.load(true)
  }
  private load(force: boolean): void {
    if (this.destroyRef.destroyed || this.confirmationOpen()) return
    const id = this.selectedRoleId()
    if (id === undefined) return
    const generation = ++this.generation
    this.request?.unsubscribe()
    const preserveDraft = this.loadedRoleId() === id && this.dirty()
    this.request = forkJoin({
      catalog: this.store.loadCatalog(force),
      assignment: this.store.loadPermissions(id, force)
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          if (generation !== this.generation || this.destroyRef.destroyed) return
          if (
            result.catalog.success &&
            result.assignment.success &&
            result.assignment.data.roleId === id
          ) {
            if (!preserveDraft) this.apply(result.assignment.data)
          }
        }
      })
  }
  private apply(assignment: PermissionAssignment): void {
    this.releaseRole?.()
    this.releaseRole = this.store.retainRole(assignment.roleId)
    this.draftPermissions.set([])
    this.loaded.set(copyAssignment(assignment))
    this.draftPermissions.set(this.permissions().map(p => ({ ...p })))
    this.model.set(
      Object.fromEntries(
        this.permissions().map(p => [
          this.key(p.id),
          assignment.permissions.some(saved => saved.id === p.id)
        ])
      )
    )
  }
  toggle(id: number, granted: boolean): void {
    if (!this.editable() || !this.permissions().some(p => p.id === id)) return
    this.model.update(value => ({ ...value, [this.key(id)]: granted }))
  }
  confirmSave(): void {
    if (this.destroyRef.destroyed || !this.canSave()) return
    const role = this.displayedRole()!
    const ids = [...this.ids()]
    const saved = this.loaded()!.permissions.map(p => p.id)
    const changes = this.permissions().flatMap(p =>
      saved.includes(p.id) === ids.includes(p.id)
        ? []
        : [{ code: p.code, module: p.module, granted: ids.includes(p.id) }]
    )
    this.confirmationOpen.set(true)
    const ref = this.dialogs.open<void, RbacSaveContext>(RbacSaveConfirmation, {
      context: {
        owner: this.destroyRef,
        role: { id: role.id, name: role.name },
        ids,
        changes,
        onSaved: assignment => {
          if (this.destroyRef.destroyed || this.loadedRoleId() !== assignment.roleId) return
          this.apply(assignment)
          this.toast.success("Permisos guardados")
        }
      },
      showCloseButton: false,
      disableClose: true,
      autoFocus: "#cancel-role-permissions",
      restoreFocus: true,
      contentClass: "sm:max-w-xl max-h-[90dvh] overflow-y-auto"
    })
    this.destroyRef.onDestroy(() => ref.close())
    ref.closed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.confirmationOpen.set(false))
  }
}
