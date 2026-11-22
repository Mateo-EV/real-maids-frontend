import { LandingHeader } from "@/app/features/landing/presentation/components/landing-header/landing-header"
import { LANDING_CONTACT_HREF, LANDING_CONTACT_PHONE } from "@/app/features/landing/presentation/landing.content"
import { ChangeDetectionStrategy, Component, signal } from "@angular/core"
import { email, form, FormField, required, submit as submitForm } from "@angular/forms/signals"

interface ApplicationModel {
  name: string
  email: string
}

@Component({
  imports: [FormField, LandingHeader],
  selector: "app-landing-work-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
  `,
  templateUrl: "./landing-work-page.html"
})
export class LandingWorkPage {
  readonly contactPhone = LANDING_CONTACT_PHONE
  readonly contactHref = LANDING_CONTACT_HREF

  readonly applicationModel = signal<ApplicationModel>({ name: "", email: "" })
  readonly applicationForm = form(this.applicationModel, path => {
    required(path.name, { message: "Enter your full name." })
    required(path.email, { message: "Enter your email." })
    email(path.email, { message: "Enter a valid email." })
  })

  readonly status = signal<"idle" | "validated">("idle")

  submitApplication(): Promise<boolean> {
    this.status.set("idle")
    return submitForm(this.applicationForm, async () => {
      // No application endpoint is connected yet: the form is validated but nothing is delivered.
      this.status.set("validated")
      return undefined
    })
  }
}
