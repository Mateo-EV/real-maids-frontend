import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core"

/**
 * One horizontal bar: the value is supplied already formatted, because the dashboard prints
 * server figures verbatim (no client arithmetic, no rounding).
 */
export interface DashboardBar {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly valueText: string
  readonly detail?: string | null
}

const fills = {
  primary: "bg-primary",
  coral: "bg-coral",
  gold: "bg-gold"
} as const

/**
 * Horizontal bar list for categorical series (orders per state, load per collaborator).
 * The bar is decoration over the text: every row prints its own label and supplied value, so
 * the figure never depends on length or colour, and a total of zero renders empty tracks
 * instead of `NaN`.
 */
@Component({
  selector: "app-dashboard-bars",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <ul class="m-0 flex list-none flex-col gap-3 p-0" [attr.aria-label]="label()">
      @for (bar of bars(); track bar.key; let index = $index) {
        <li
          class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3"
          [attr.data-bar]="bar.key"
          [attr.data-bar-index]="index"
        >
          <p class="truncate text-xs font-medium text-foreground">{{ bar.label }}</p>
          <p class="text-xs font-semibold tabular-nums text-primary">{{ bar.valueText }}</p>
          <div class="col-span-2 mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              class="h-full rounded-full transition-[width]"
              [class]="fill()"
              [style.width.%]="width(bar)"
            ></div>
          </div>
          @if (bar.detail) {
            <p class="col-span-2 text-[0.7rem] text-muted-foreground">{{ bar.detail }}</p>
          }
        </li>
      }
    </ul>
  `
})
export class DashboardBars {
  readonly bars = input.required<readonly DashboardBar[]>()
  readonly label = input.required<string>()
  readonly tone = input<keyof typeof fills>("primary")

  readonly fill = computed(() => fills[this.tone()])

  private readonly total = computed(() =>
    this.bars().reduce((sum, bar) => sum + safeValue(bar.value), 0)
  )

  /** Relative share of the supplied set; a zero total is a zero-width bar, never a divide. */
  width(bar: DashboardBar): number {
    const total = this.total()
    if (total <= 0) return 0
    return Math.min(100, (safeValue(bar.value) / total) * 100)
  }
}

function safeValue(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}
