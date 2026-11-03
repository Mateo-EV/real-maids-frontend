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
import { CustomerContact } from "../../../domain/entities/customer-contact.entity"
import { CustomerRelationsStore } from "../../state/customer-relations.store"
import { ContactEditor } from "../contact-editor/contact-editor"

@Component({
  selector: "app-customer-contacts",
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
  templateUrl: "./customer-contacts.html"
})
export class CustomerContacts implements OnInit {
  readonly confirmedWrite = output<void>()
  readonly customer = input.required<Customer>()
  readonly ownerChanged$ = input.required<Observable<void>>()
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
  readonly contacts = computed(() => this.relations.selectContacts(this.customer().id))
  readonly pending = computed(() => this.relations.pendingContactWrites() > 0)

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.dialog?.close())
    // The page emits synchronously, before Angular replaces the keyed owner view.
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
      .loadContacts(this.customer().id, force)
      .pipe(
        takeUntil(this.ownerChanged$()),
        takeUntil(this.scope.cancelled$),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }
  edit(contact: CustomerContact | null = null): void {
    if (!this.current() || this.pending() || this.dialog?.open) return
    const customer = this.customer()
    if (
      contact &&
      (contact.customerId !== customer.id ||
        !this.contacts().loaded ||
        !this.contacts().data.includes(contact))
    )
      return
    const generation = this.scope.generation()
    const current = () => this.current() && generation === this.scope.generation()
    this.dialog = this.dialogs.open(ContactEditor, {
      context: {
        customerId: customer.id,
        customerName: customer.name,
        contact,
        owner: this.destroyRef,
        ownerChanged$: this.ownerChanged$(),
        current,
        onSaved: () => {
          if (!current()) return
          this.toast.success(
            contact ? "Contacto actualizado correctamente." : "Contacto creado correctamente."
          )
          // Relations reads are finite; confirmed writes invalidate but do not observe/refetch.
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
