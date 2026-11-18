import { computed, Directive, input } from "@angular/core"

import { badgeTone, type BadgeToneKind } from "@/app/shared/ui/badge-tone"

/**
 * Paints a Helm badge with a shared value tone:
 *
 * ```html
 * <span hlmBadge variant="outline" [appBadgeTone]="request.status" badgeToneKind="request-status">
 * ```
 *
 * The directive only sets `data-badge-tone`; the palette lives in `src/styles.css`.
 */
@Directive({
  selector: "[appBadgeTone]",
  host: { "[attr.data-badge-tone]": "tone()" }
})
export class BadgeTone {
  /** Raw value to classify (a status code, a customer type, a catalog name, a flag). */
  public readonly appBadgeTone = input<unknown>(null)

  /** Which value set `appBadgeTone` belongs to. */
  public readonly badgeToneKind = input<BadgeToneKind>("catalog-name")

  protected readonly tone = computed(() => badgeTone(this.appBadgeTone(), this.badgeToneKind()))
}
