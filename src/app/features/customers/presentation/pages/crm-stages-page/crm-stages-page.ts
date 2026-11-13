import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { takeUntil } from "rxjs"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"

/** Read-only catalog consumer: the root read, its freshness and its states stay unchanged. */
@Component({
  selector: "app-crm-stages-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CatalogFrame,
    HlmTableImports,
    HlmBadgeImports,
    HlmEmptyImports,
    HlmAlertImports,
    HlmSpinnerImports,
    HlmButtonImports
  ],
  templateUrl: "./crm-stages-page.html"
})
export class CrmStagesPage implements OnInit {
  private readonly acquisition = inject(CustomerAcquisitionStore)
  private readonly destroyRef = inject(DestroyRef)
  readonly stages = computed(() => this.acquisition.stages())
  private readonly scope = createSessionReadScope(() => undefined)

  private read(force = false): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    this.acquisition
      .loadStages(force)
      .pipe(takeUntil(this.scope.cancelled$), takeUntilDestroyed(this.destroyRef))
      .subscribe()
  }

  retry(): void {
    this.read(true)
  }

  ngOnInit(): void {
    this.scope.check()
    this.read()
  }
}
