import { LandingHeader } from "@/app/features/landing/presentation/components/landing-header/landing-header"
import { LANDING_CONTACT_HREF, LANDING_CONTACT_PHONE } from "@/app/features/landing/presentation/landing.content"
import { ChangeDetectionStrategy, Component } from "@angular/core"

/**
 * SAMPLE reviews only. Replace each entry with a real, approved client review before publishing;
 * never show invented testimonials as genuine.
 */
export const LANDING_REVIEWS = [
  {
    name: "Sample client 1",
    location: "Tampa, FL",
    rating: 5,
    text: "Sample review text. Replace with a real client review."
  },
  {
    name: "Sample client 2",
    location: "Lutz, FL",
    rating: 5,
    text: "Sample review text. Replace with a real client review."
  },
  {
    name: "Sample client 3",
    location: "Palmetto, FL",
    rating: 4,
    text: "Sample review text. Replace with a real client review."
  }
] as const

@Component({
  imports: [LandingHeader],
  selector: "app-landing-reviews-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
  `,
  templateUrl: "./landing-reviews-page.html"
})
export class LandingReviewsPage {
  readonly contactPhone = LANDING_CONTACT_PHONE
  readonly contactHref = LANDING_CONTACT_HREF
  readonly reviews = LANDING_REVIEWS
  readonly stars = (rating: number): string => "★".repeat(rating) + "☆".repeat(5 - rating)
}
