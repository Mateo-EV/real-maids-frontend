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

/**
 * Presentation only: the row is the host so `src/styles.css` `.catalog-filter-row > *`
 * keeps targeting the search block, each select wrapper and the projected action button.
 * Queries, debounce and store writes stay consumer-owned.
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
  readonly searchInputId = input.required<string>()
  readonly searchLabel = input.required<string>()
  readonly searchPlaceholder = input.required<string>()
  readonly searchValue = input("")
  readonly selects = input<readonly CatalogFilterSelect[]>([])
  readonly searchChange = output<string>()
  readonly selectChange = output<{ id: string; value: string }>()
}
