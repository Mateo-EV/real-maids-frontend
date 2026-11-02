import { ChangeDetectionStrategy, Component, input } from "@angular/core"

/** Presentation only: queries, controls, records and pagination stay consumer-owned. */
@Component({
  selector: "app-catalog-frame",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block min-w-0", style: "container-type: inline-size" },
  template: `
    <section
      class="overflow-hidden rounded-xl border bg-card shadow-sm"
      [attr.aria-labelledby]="titleId()"
      [attr.aria-busy]="busy()"
    >
      <header class="flex flex-col gap-4 border-b p-4 xl:flex-row xl:items-end xl:justify-between">
        <div class="xl:self-start">
          <h1 [id]="titleId()" class="text-lg font-bold tracking-tight text-primary">
            {{ title() }}
          </h1>
          <p class="mt-1 max-w-prose text-xs text-muted-foreground">{{ description() }}</p>
        </div>
        <ng-content select="[catalogControls]" />
      </header>
      <ng-content />
      <footer
        class="flex flex-wrap items-center justify-between gap-3 border-t bg-background/50 px-4 py-3"
      >
        <ng-content select="[catalogFooter]" />
      </footer>
    </section>
  `
})
export class CatalogFrame {
  readonly titleId = input.required<string>()
  readonly title = input.required<string>()
  readonly description = input.required<string>()
  readonly busy = input(false)
}
