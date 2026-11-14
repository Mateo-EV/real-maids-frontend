import { ChangeDetectionStrategy, Component, input, output } from "@angular/core"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideSearch } from "@ng-icons/lucide"
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"

export interface CatalogFilterSelectOption {
  readonly value: string
  readonly label: string
}

export interface CatalogFilterSelect {
  readonly id: string
  readonly label: string
  readonly allLabel: string
  readonly value: string
  readonly options: readonly CatalogFilterSelectOption[]
}

/** Native calendar filter: the value is the `YYYY-MM-DD` string the input produced. */
export interface CatalogFilterDate {
  readonly id: string
  readonly label: string
  readonly value: string
}

/**
 * Presentation only: the row is the host so `src/styles.css` `.catalog-filter-row > *`
 * keeps targeting the search block, each select wrapper, each date wrapper and the
 * projected action button. Queries, debounce and store writes stay consumer-owned.
 *
 * The search block only renders when `searchInputId` is supplied, so lists whose server
 * contract has no text search (operations requests/orders) do not show a dead input.
 */
@Component({
  selector: "app-catalog-filters",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmInputGroupImports, HlmNativeSelectImports, NgIcon],
  providers: [provideIcons({ lucideSearch })],
  host: { class: "catalog-filter-row flex min-w-0 flex-wrap items-end gap-2" },
  templateUrl: "./catalog-filters.html"
})
export class CatalogFilters {
  readonly searchInputId = input("")
  readonly searchLabel = input("")
  readonly searchPlaceholder = input("")
  readonly searchValue = input("")
  readonly selects = input<readonly CatalogFilterSelect[]>([])
  readonly dates = input<readonly CatalogFilterDate[]>([])
  readonly searchChange = output<string>()
  readonly selectChange = output<{ id: string; value: string }>()
  readonly dateChange = output<{ id: string; value: string }>()

  protected dateChanged(id: string, event: Event): void {
    this.dateChange.emit({ id, value: (event.target as HTMLInputElement).value })
  }
}
