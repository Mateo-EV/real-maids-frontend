import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { Lang } from "@/app/features/users/domain/entities/user.entity"
import { environment } from "@/environments/environment"
import { environment as production } from "@/environments/environment.production"
import { AdminShell } from "./admin-shell"

const identity = { name: "Actual Identity", email: "identity@example.test" }

describe("AdminShell", () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
  const mediaQuery = (matches: boolean) => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })
  beforeEach(() => {
    // jsdom cannot measure layout; ResizeObserver is a browser-only test shim.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    )
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery(false))
    )
    TestBed.configureTestingModule({
      imports: [AdminShell],
      providers: [
        provideRouter([]),
        {
          provide: AuthStore,
          useValue: { session: signal(identity), logout: vi.fn() }
        }
      ]
    })
  })
  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    vi.unstubAllGlobals()
  })

  async function setup() {
    const fixture = TestBed.createComponent(AdminShell)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return {
      fixture,
      shell: fixture.componentInstance,
      element: fixture.nativeElement as HTMLElement
    }
  }

  it("uses enum-backed Spanish default and permits only visual Spanish/English changes", async () => {
    const { fixture, shell, element } = await setup()
    expect(shell.language()).toBe(Lang.ES)
    expect(element.querySelector("hlm-select-value")?.textContent).toBe("Español")
    const trigger = element.querySelector<HTMLButtonElement>("#admin-language")!
    expect(trigger.tagName).toBe("BUTTON")
    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()
    const options = Array.from(document.querySelectorAll<HTMLElement>("hlm-select-item"))
    expect(options.map(option => option.textContent?.trim())).toEqual(["Español", "Inglés"])
    options[1].click()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(shell.language()).toBe(Lang.EN)
    expect(element.querySelector("hlm-select-value")?.textContent).toBe("Inglés")
    shell.setLanguage("fr")
    expect(shell.language()).toBe(Lang.EN)
    shell.setLanguage(Lang.ES)
    expect(shell.language()).toBe(Lang.ES)
    expect(TestBed.inject(AuthStore).session()).toBe(identity)
    expect(TestBed.inject(AuthStore).logout).not.toHaveBeenCalled()
  })

  it("shows public labels and retains session identity and logout", async () => {
    const { shell, element } = await setup()
    expect(environment.label).toBe("Desarrollo")
    expect(production.label).toBe("Producción")
    expect(element.textContent).toContain(`Entorno: ${environment.label}`)
    expect(element.textContent).toContain(identity.email)
    const navigate = vi.spyOn(TestBed.inject(Router), "navigateByUrl").mockResolvedValue(true)
    const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(item =>
      item.textContent?.includes("Salir")
    )!
    button.click()
    expect(TestBed.inject(AuthStore).logout).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith("/login")
    expect(shell.sessionInitials()).toBe("AI")
  })

  it("keeps the sole accessible desktop toggle in the upper status strip", async () => {
    const { fixture, shell, element } = await setup()
    const triggers = element.querySelectorAll<HTMLButtonElement>("button[hlmSidebarTrigger]")
    expect(triggers).toHaveLength(1)
    const trigger = triggers[0]
    expect(trigger.closest(".status-header")).not.toBeNull()
    expect(element.querySelector("header button[hlmSidebarTrigger]")).toBeNull()
    expect(trigger.querySelector(".sr-only")?.textContent).toBe("Alternar navegación")
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(shell.sidebar.open()).toBe(false)
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(shell.sidebar.open()).toBe(true)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
  })

  it("presents the static system copy as a Helm badge with a decorative dot", async () => {
    const { element } = await setup()
    const badge = element.querySelector('.status-header [hlmBadge][data-slot="badge"]')!
    expect(badge).not.toBeNull()
    expect(badge.textContent?.trim()).toBe("Sistema seguro y activo")
    expect(badge.querySelector('.status-dot[aria-hidden="true"]')).not.toBeNull()
    expect(badge.hasAttribute("role")).toBe(false)
    expect(badge.hasAttribute("aria-live")).toBe(false)
  })

  it("routes the accessible mobile toggle and IAM dismissal through the generated service", async () => {
    // Simulate the browser breakpoint response, not a rendered viewport.
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => mediaQuery(true))
    )
    const { fixture, shell, element } = await setup()
    expect(shell.sidebar.isMobile()).toBe(true)
    const trigger = element.querySelector<HTMLButtonElement>("button[hlmSidebarTrigger]")!
    expect(trigger.textContent).toContain("Alternar navegación")
    expect(trigger.closest(".status-header")).not.toBeNull()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(shell.sidebar.openMobile()).toBe(true)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    const nav = document.querySelector('nav[aria-label="Navegación administrativa"]')!
    expect(nav).not.toBeNull()
    expect(document.querySelector("[hlmSheetTitle]")?.textContent).toContain(
      "Navegación administrativa"
    )
    const link = nav.querySelector<HTMLAnchorElement>('a[href="/admin/users"]')!
    // Keep this service test independent of route loading, covered by the route harness.
    vi.spyOn(TestBed.inject(Router), "navigateByUrl").mockResolvedValue(true)
    link.click()
    expect(shell.sidebar.openMobile()).toBe(false)
  })
})
