import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild
} from "@angular/core"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideChevronDown, lucideRefreshCw } from "@ng-icons/lucide"
import {
  BrnCombobox,
  BrnComboboxAnchor,
  BrnComboboxInput,
  BrnComboboxPopoverTrigger,
  BrnComboboxTrigger
} from "@spartan-ng/brain/combobox"
import { HlmButton } from "@spartan-ng/helm/button"
import { HlmComboboxImports } from "@spartan-ng/helm/combobox"
import { HlmInput } from "@spartan-ng/helm/input"

/** One option of the loaded page: the value is reported on selection, the label is what users see. */
export interface CatalogComboboxOption {
  readonly value: string
  readonly label: string
}

/**
 * Presentational catalog picker. The consumer owns the server search, the loaded page, the
 * selection and the effective page metadata, so nothing here queries, filters or pages locally (S9).
 */
@Component({
  selector: "app-catalog-combobox",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIcon,
    HlmButton,
    HlmInput,
    HlmComboboxImports,
    BrnComboboxAnchor,
    BrnComboboxInput,
    BrnComboboxPopoverTrigger,
    BrnComboboxTrigger
  ],
  providers: [provideIcons({ lucideChevronDown, lucideRefreshCw })],
  templateUrl: "./catalog-combobox.html"
})
export class CatalogCombobox {
  readonly id = input.required<string>()
  readonly label = input.required<string>()
  readonly placeholder = input("Selecciona una opción")
  readonly emptyLabel = input("Sin opciones en esta página.")
  readonly searchPlaceholder = input("Buscar…")
  readonly selectedLabel = input("")
  readonly options = input<readonly CatalogComboboxOption[]>([])
  readonly loading = input(false)
  readonly errorLabel = input("")
  readonly page = input(1)
  readonly pageCount = input<number>()
  readonly searchChange = output<string>()
  readonly selectChange = output<string>()
  readonly reload = output<void>()
  readonly pageChange = output<number>()

  /** Panel state owned here so Escape can close it and hand focus back to the trigger. */
  protected readonly open = signal<"open" | "closed">("closed")
  /** Last search handed to the consumer; the server decides which options come back. */
  protected readonly search = signal("")
  /** Consumers pass a label, so the matching option is only known through the loaded page. */
  protected readonly selectedValue = computed(
    () => this.options().find(option => option.label === this.selectedLabel())?.value ?? null
  )
  /** Id of the option the key manager highlights, for the search input's aria-activedescendant. */
  protected readonly activeOption = signal<string | null>(null)
  protected readonly hasPagination = computed(() => this.pageCount() !== undefined)
  protected readonly canGoBack = computed(() => this.page() > 1)
  protected readonly canGoForward = computed(() => this.page() < (this.pageCount() ?? 1))
  private readonly combobox = viewChild(BrnCombobox)

  /** Always true: a loaded page is a slice, never a catalog to filter in the browser. */
  protected readonly showOption = () => true

  constructor() {
    effect(onCleanup => {
      const combobox = this.combobox()
      if (!combobox) return
      const subscription = combobox.keyManager.change.subscribe(() => {
        this.activeOption.set(combobox.keyManager.activeItem?.id() ?? null)
      })
      onCleanup(() => subscription.unsubscribe())
    })
  }

  protected searchOptions(value: string): void {
    this.search.set(value)
    this.searchChange.emit(value)
  }

  protected selectOption(value: unknown): void {
    if (typeof value === "string" && this.options().some(option => option.value === value))
      this.selectChange.emit(value)
  }

  /**
   * The combobox only reports `valueChange` when its own value changes, so clicking the option that
   * already represents the selection stays silent. Every explicit click is a selection.
   */
  protected selectClickedOption(value: string): void {
    if (value === this.selectedValue()) this.selectChange.emit(value)
  }

  protected closeOnEscape(event: Event, trigger: HTMLButtonElement): void {
    event.stopPropagation()
    this.open.set("closed")
    trigger.focus()
  }
}
