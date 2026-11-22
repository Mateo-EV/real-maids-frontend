import { LandingHeader } from "@/app/features/landing/presentation/components/landing-header/landing-header"
import { LANDING_CONTACT_HREF, LANDING_CONTACT_PHONE, LANDING_SERVICES } from "@/app/features/landing/presentation/landing.content"
import { ChangeDetectionStrategy, Component } from "@angular/core"

@Component({
  imports: [LandingHeader],
  selector: "app-landing-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
  `,
  templateUrl: "./landing-page.html"
})
export class LandingPage {
  readonly contactPhone = LANDING_CONTACT_PHONE
  readonly contactHref = LANDING_CONTACT_HREF
  readonly services = LANDING_SERVICES
}
