import { Component, computed, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { FormField, FormRoot, disabled, form } from "@angular/forms/signals"
import { Subscription } from "rxjs"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmCardImports } from "@spartan-ng/helm/card"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { HlmCheckboxImports } from "@spartan-ng/helm/checkbox"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import {
  copyRbacMatrix,
  OPERATIONS_RULES,
  RBAC_ACTIONS,
  RBAC_MODULES,
  RbacAction,
  RbacGrant,
  RbacMatrix as Matrix,
  RbacModule
} from "../../../domain/models/rbac-matrix"
import { RolesStore } from "../../state/roles.store"
import { RbacStore } from "../../state/rbac.store"
import {
  RolePermissionsConfirmation,
  RolePermissionsContext
} from "../role-permissions-confirmation/role-permissions-confirmation"

type Choices = Record<RbacModule, Record<RbacAction, boolean>>
function choices(grants: readonly RbacGrant[]): Choices {
  return Object.fromEntries(
    RBAC_MODULES.map(module => [
      module.id,
      Object.fromEntries(
        RBAC_ACTIONS.map(action => [
          action.id,
          grants.some(g => g.module === module.id && g.action === action.id)
        ])
      )
    ])
  ) as Choices
}

@Component({
  selector: "app-rbac-matrix",
  imports: [
    FormRoot,
    FormField,
    HlmButtonImports,
    HlmCardImports,
    HlmTableImports,
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
  readonly modules = RBAC_MODULES
  readonly actions = RBAC_ACTIONS
  readonly selectedRoleId = signal(2)
  readonly loaded = signal<Matrix | undefined>(undefined)
  readonly loadedRoleId = computed(() => this.loaded()?.roleId)
  readonly displayedRole = computed(() =>
    this.roles.roles().find(r => r.id === this.loadedRoleId())
  )
  readonly model = signal(choices([]))
  readonly matrixForm = form(this.model, path => disabled(path, () => !this.editable()))
  readonly grants = computed(() =>
    this.modules.flatMap(module =>
      this.actions
        .filter(action => this.model()[module.id][action.id])
        .map(action => ({ module: module.id, action: action.id }))
    )
  )
  readonly loading = signal(false)
  readonly confirmationOpen = signal(false)
  readonly error = signal("")
  readonly dirty = computed(() => {
    const saved = this.loaded()?.grants ?? []
    const current = this.grants()
    return (
      current.length !== saved.length ||
      current.some(g => !saved.some(s => s.module === g.module && s.action === g.action))
    )
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
  readonly canSave = computed(() => this.editable() && (this.dirty() || !this.loaded()?.configured))
  private request?: Subscription
  private generation = 0
  ngOnInit(): void {
    this.retry()
  }
  selectRole(value: string | null | undefined): void {
    if (this.destroyRef.destroyed || this.confirmationOpen()) return
    const id = Number(value)
    if (!this.roles.roles().some(r => r.id === id)) return
    this.selectedRoleId.set(id)
    this.retry()
  }
  retry(): void {
    if (this.destroyRef.destroyed || this.confirmationOpen()) return
    const generation = ++this.generation
    this.request?.unsubscribe()
    this.loading.set(true)
    this.error.set("")
    const id = this.selectedRoleId()
    this.request = this.store
      .loadPermissions(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (generation !== this.generation || this.destroyRef.destroyed) return
        this.loading.set(false)
        if (result.success && result.data.roleId === id) this.apply(result.data)
        else
          this.error.set(
            "No pudimos cargar los permisos. Los cambios visibles se conservan; reintenta para continuar."
          )
      })
  }
  private apply(matrix: Matrix): void {
    this.loaded.set(copyRbacMatrix(matrix))
    this.model.set(choices(matrix.grants))
  }
  toggle(module: RbacModule, action: RbacAction, granted: boolean): void {
    if (!this.editable()) return
    this.model.update(value => ({ ...value, [module]: { ...value[module], [action]: granted } }))
  }
  rule(module: RbacModule): string {
    return this.loadedRoleId() === 2 ? OPERATIONS_RULES[module] : "Sin reglas configuradas"
  }
  confirmSave(): void {
    if (this.destroyRef.destroyed || !this.canSave()) return
    const role = this.displayedRole()!
    const grants = this.grants().map(g => ({ ...g }))
    const saved = this.loaded()!.grants
    const changes = this.modules.flatMap(module =>
      this.actions.flatMap(action => {
        const before = saved.some(g => g.module === module.id && g.action === action.id)
        const after = grants.some(g => g.module === module.id && g.action === action.id)
        return before === after ? [] : [{ module: module.id, action: action.id, granted: after }]
      })
    )
    this.confirmationOpen.set(true)
    const ref = this.dialogs.open<void, RolePermissionsContext>(RolePermissionsConfirmation, {
      context: {
        owner: this.destroyRef,
        role: { id: role.id, name: role.name },
        grants,
        changes,
        onSaved: matrix => {
          if (this.destroyRef.destroyed || this.loadedRoleId() !== matrix.roleId) return
          this.apply(matrix)
          this.toast.success("Permisos guardados")
        }
      },
      showCloseButton: false,
      disableClose: true,
      autoFocus: "#cancel-role-permissions",
      restoreFocus: true,
      contentClass: "sm:max-w-xl max-h-[90dvh] overflow-y-auto"
    })
    // Parent component destruction must cancel an independently mounted pending overlay too.
    this.destroyRef.onDestroy(() => ref.close())
    ref.closed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.confirmationOpen.set(false))
  }
}
