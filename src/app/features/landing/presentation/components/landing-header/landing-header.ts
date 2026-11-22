import { ChangeDetectionStrategy, Component, input } from "@angular/core"
import {
  LANDING_CONTACT_HREF,
  LANDING_CONTACT_PHONE,
  LANDING_NAV,
  LandingNavKey
} from "@/app/features/landing/presentation/landing.content"

@Component({
  selector: "app-landing-header",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
  `,
  templateUrl: "./landing-header.html"
})
export class LandingHeader {
  readonly active = input<LandingNavKey | null>(null)
  readonly nav = LANDING_NAV
  readonly contactPhone = LANDING_CONTACT_PHONE
  readonly contactHref = LANDING_CONTACT_HREF
}
