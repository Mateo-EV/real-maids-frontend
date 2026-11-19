import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core"

/**
 * One column of a dated series. `axisLabel` is a compact rendering of the supplied day and
 * `accessibleLabel` carries the full supplied text; neither is parsed as an instant.
 */
export interface DashboardColumn {
  readonly key: string
  readonly axisLabel: string
  readonly accessibleLabel: string
  readonly value: number
  readonly valueText: string
}

/**
 * Column chart for a dated series (services per day). Columns share the row evenly, so the
 * series keeps its width on a dashboard card instead of being buried in a long table. Axis
 * labels are thinned to about six and each column keeps its full text for assistive
 * technology; per-column values are printed while the run is short enough to stay readable.
 */
@Component({
  selector: "app-dashboard-columns",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <ol class="m-0 flex list-none items-end gap-1 p-0" [attr.aria-label]="label()">
      @for (column of columns(); track column.key; let index = $index) {
        <li class="flex min-w-0 flex-1 flex-col items-center gap-1" [attr.data-column]="column.key">
          @if (printValues()) {
            <span class="text-[0.65rem] font-semibold tabular-nums text-primary">{{
              column.valueText
            }}</span>
          }
          <div class="flex h-24 w-full items-end rounded-sm bg-muted" aria-hidden="true">
            <div class="w-full rounded-sm bg-coral" [style.height.%]="height(column)"></div>
          </div>
          <span class="h-3 text-[0.6rem] leading-3 text-muted-foreground">{{
            showAxisLabel(index) ? column.axisLabel : ""
          }}</span>
          <span class="sr-only">{{ column.accessibleLabel }}</span>
        </li>
      }
    </ol>
  `
})
export class DashboardColumns {
  readonly columns = input.required<readonly DashboardColumn[]>()
  readonly label = input.required<string>()

  /** Values stay printed while the run is short; beyond that the axis and text carry them. */
  readonly printValues = computed(() => this.columns().length <= 14)

  private readonly peak = computed(() =>
    this.columns().reduce((max, column) => Math.max(max, safeValue(column.value)), 0)
  )

  private readonly stride = computed(() => Math.max(1, Math.ceil(this.columns().length / 6)))

  /** Axis thinning keeps the row readable; the first column always carries its label. */
  showAxisLabel(index: number): boolean {
    return index % this.stride() === 0
  }

  /** Height relative to the tallest supplied point; an all-zero run draws empty columns. */
  height(column: DashboardColumn): number {
    const peak = this.peak()
    if (peak <= 0) return 0
    return Math.min(100, (safeValue(column.value) / peak) * 100)
  }
}

function safeValue(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}
