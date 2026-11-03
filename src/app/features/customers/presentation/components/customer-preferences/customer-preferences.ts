import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output
} from "@angular/core"
import { NgTemplateOutlet } from "@angular/common"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { Observable, Subscription, takeUntil } from "rxjs"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HotToastService } from "@ngxpert/hot-toast"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { Customer } from "../../../domain/entities/customer.entity"
import { CustomerPreference } from "../../../domain/entities/customer-preference.entity"
import { CustomerRelationsStore } from "../../state/customer-relations.store"
import { PreferenceEditor } from "../preference-editor/preference-editor"
import { OwnerPropertyRead, preferencePropertyChoices } from "./preference-property-choices"

@Component({
  selector: "app-customer-preferences",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    CatalogFrame,
    HlmButtonImports,
    HlmTableImports,
    HlmBadgeImports,
    HlmAlertImports,
    HlmEmptyImports,
    HlmSpinnerImports
  ],
  templateUrl: "./customer-preferences.html"
})
export class CustomerPreferences implements OnInit {
  readonly confirmedWrite = output<void>()
  readonly customer = input.required<Customer>()
  readonly ownerChanged$ = input.required<Observable<void>>()
  readonly propertyRead = input<OwnerPropertyRead>()
  private readonly relations = inject(CustomerRelationsStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private dialog: BrnDialogRef | undefined
  private read: Subscription | undefined
  private ended = false
  private readonly scope = createSessionReadScope(() => {
    this.ended = true
    this.dialog?.close()
  })
  readonly preferences = computed(() => this.relations.selectPreferences(this.customer().id))
  readonly pending = computed(() => this.relations.pendingPreferenceWrites() > 0)
  readonly choices = computed(() =>
    preferencePropertyChoices(this.customer().id, this.propertyRead())
  )
  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.dialog?.close())
    this.ownerChanged$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.ended = true
        this.dialog?.close()
      })
    this.load()
  }
  private current(): boolean {
    return !this.destroyRef.destroyed && !this.ended && this.scope.check()
  }
  load(force = false): void {
    if (!this.current()) return
    this.read?.unsubscribe()
    this.read = this.relations
      .loadPreferences(this.customer().id, force)
      .pipe(
        takeUntil(this.ownerChanged$()),
        takeUntil(this.scope.cancelled$),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }
  propertyLabel(id: number | null): string {
    return id === null
      ? "Todo el cliente"
      : (this.choices().items.find(p => p.id === id)?.label ??
          `Propiedad ID ${id} · Sin verificar en las opciones actuales`)
  }
  edit(preference: CustomerPreference | null = null): void {
    if (!this.current() || this.pending() || this.dialog?.open) return
    const customer = this.customer()
    if (
      preference &&
      (preference.customerId !== customer.id ||
        !this.preferences().loaded ||
        !this.preferences().data.includes(preference))
    )
      return
    const generation = this.scope.generation()
    const current = () => this.current() && generation === this.scope.generation()
    this.dialog = this.dialogs.open(PreferenceEditor, {
      context: {
        customerId: customer.id,
        customerName: customer.name,
        preference,
        choices: this.choices,
        owner: this.destroyRef,
        ownerChanged$: this.ownerChanged$(),
        current,
        onSaved: () => {
          if (!current()) return
          this.toast.success(
            preference
              ? "Preferencia actualizada correctamente."
              : "Preferencia creada correctamente."
          )
          // Finite relations reads invalidate on writes but do not auto-refetch.
          if (current()) this.load(true)
          if (current()) this.confirmedWrite.emit()
        }
      },
      showCloseButton: false,
      disableClose: true,
      contentClass: "sm:max-w-lg max-h-[90dvh] overflow-y-auto"
    })
  }
}
