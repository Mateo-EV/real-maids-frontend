import { LandingHeader } from "@/app/features/landing/presentation/components/landing-header/landing-header"
import {
  LANDING_CLEANING_TYPES,
  LANDING_CONTACT_HREF,
  LANDING_CONTACT_PHONE,
  LANDING_HOME_SIZES
} from "@/app/features/landing/presentation/landing.content"
import { ChangeDetectionStrategy, Component, signal } from "@angular/core"
import { email, form, FormField, pattern, required, submit as submitForm } from "@angular/forms/signals"

interface QuoteModel {
  zip: string
  cleaningType: string
  homeSize: string
  preferredDay: string
  name: string
  phone: string
  email: string
}

@Component({
  imports: [FormField, LandingHeader],
  selector: "app-landing-quote-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
  `,
  templateUrl: "./landing-quote-page.html"
})
export class LandingQuotePage {
  readonly contactPhone = LANDING_CONTACT_PHONE
  readonly contactHref = LANDING_CONTACT_HREF
  readonly cleaningTypes = LANDING_CLEANING_TYPES
  readonly homeSizes = LANDING_HOME_SIZES

  readonly quoteModel = signal<QuoteModel>({
    zip: "",
    cleaningType: "",
    homeSize: "",
    preferredDay: "",
    name: "",
    phone: "",
    email: ""
  })

  readonly quoteForm = form(this.quoteModel, path => {
    required(path.zip, { message: "Enter your ZIP code." })
    pattern(path.zip, /^\d{5}$/, { message: "ZIP codes have 5 digits." })
    required(path.cleaningType, { message: "Choose a cleaning type." })
    required(path.homeSize, { message: "Choose your home size." })
    required(path.preferredDay, { message: "Choose a preferred day." })
    required(path.name, { message: "Enter your name." })
    required(path.phone, { message: "Enter a phone number." })
    pattern(path.phone, /^[+()\-\s\d]{7,20}$/, { message: "Enter a valid phone number." })
    required(path.email, { message: "Enter your email." })
    email(path.email, { message: "Enter a valid email." })
  })

  readonly status = signal<"idle" | "validated">("idle")

  submitQuote(): Promise<boolean> {
    this.status.set("idle")
    return submitForm(this.quoteForm, async () => {
      // No public quote endpoint is connected yet: the request is validated but not delivered.
      this.status.set("validated")
      return undefined
    })
  }
}
