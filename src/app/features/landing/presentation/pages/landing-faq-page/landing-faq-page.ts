import { LandingHeader } from "@/app/features/landing/presentation/components/landing-header/landing-header"
import { LANDING_CONTACT_HREF, LANDING_CONTACT_PHONE, LANDING_FAQS } from "@/app/features/landing/presentation/landing.content"
import { ChangeDetectionStrategy, Component } from "@angular/core"

@Component({
  imports: [LandingHeader],
  selector: "app-landing-faq-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
  `,
  templateUrl: "./landing-faq-page.html"
})
export class LandingFaqPage {
  readonly contactPhone = LANDING_CONTACT_PHONE
  readonly contactHref = LANDING_CONTACT_HREF
  readonly faqs = LANDING_FAQS
}
