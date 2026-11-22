import { ChangeDetectionStrategy, Component, signal } from "@angular/core"
import { email, form, FormField, pattern, required, submit as submitForm } from "@angular/forms/signals"

/** Placeholder: replace with the company's real phone number before launch. */
export const LANDING_CONTACT_PHONE = "+1 813 000 0000"

export const LANDING_SERVICES = [
  {
    number: "01",
    badge: "Popular",
    name: "VIP Program",
    description: "Recurring weekly or biweekly care.",
    tone: "sage"
  },
  {
    number: "02",
    badge: "Fresh",
    name: "Move In / Out",
    description: "A detailed reset before keys change.",
    tone: "peach"
  },
  {
    number: "03",
    badge: "Regular",
    name: "Housekeeping",
    description: "Reliable support for your regular routine.",
    tone: "sky"
  }
] as const

export const LANDING_SERVICE_OPTIONS = LANDING_SERVICES.map(service => service.name)

interface QuoteModel {
  name: string
  email: string
  phone: string
  zip: string
  service: string
  details: string
}

@Component({
  imports: [FormField],
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
  readonly contactHref = `tel:${LANDING_CONTACT_PHONE.replace(/[^+\d]/g, "")}`
  readonly services = LANDING_SERVICES
  readonly serviceOptions = LANDING_SERVICE_OPTIONS

  readonly zipModel = signal({ zip: "" })
  readonly zipForm = form(this.zipModel, path => {
    required(path.zip, { message: "Enter your ZIP code." })
    pattern(path.zip, /^\d{5}$/, { message: "ZIP codes have 5 digits." })
  })
  readonly zipChecked = signal(false)

  readonly quoteModel = signal<QuoteModel>({
    name: "",
    email: "",
    phone: "",
    zip: "",
    service: "",
    details: ""
  })
  readonly quoteForm = form(this.quoteModel, path => {
    required(path.name, { message: "Enter your name." })
    required(path.email, { message: "Enter your email." })
    email(path.email, { message: "Enter a valid email." })
    required(path.phone, { message: "Enter a phone number." })
    pattern(path.phone, /^[+()\-\s\d]{7,20}$/, { message: "Enter a valid phone number." })
    required(path.zip, { message: "Enter your ZIP code." })
    pattern(path.zip, /^\d{5}$/, { message: "ZIP codes have 5 digits." })
    required(path.service, { message: "Choose a service." })
  })

  readonly quoteStatus = signal<"idle" | "validated">("idle")

  checkZip(): void {
    this.zipForm().markAsTouched()
    this.zipChecked.set(this.zipForm().valid())
  }

  submitQuote(): Promise<boolean> {
    this.quoteStatus.set("idle")
    return submitForm(this.quoteForm, async () => {
      // No public quote endpoint is connected yet: the form only validates the request.
      this.quoteStatus.set("validated")
      return undefined
    })
  }

  scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
}
