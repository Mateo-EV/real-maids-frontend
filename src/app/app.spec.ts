import { afterNextRender, Component, PLATFORM_ID } from "@angular/core"
import { ComponentFixture, TestBed } from "@angular/core/testing"
import {
  NavigationCancel,
  NavigationCancellationCode,
  provideRouter,
  Router,
  RouterOutlet
} from "@angular/router"
import { ReplaySubject } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "./app"
import { AuthStore } from "./features/auth/presentation/state/auth.store"
import { authGuard, guestGuard } from "./features/auth/presentation/guards/auth.guard"
import { AuthSession } from "./features/auth/domain/entities/auth-session.entity"

const loginConstructed = vi.fn()
const protectedConstructed = vi.fn()

@Component({ template: '<form><input name="email" /><input type="password" /></form>' })
class LoginProbe {
  constructor() {
    loginConstructed()
  }
}

@Component({ imports: [RouterOutlet], template: "<router-outlet />" })
class AdminProbe {}

@Component({ template: '<input name="protected-data" />' })
class UsersProbe {
  constructor() {
    protectedConstructed()
  }
}

describe("Initial routed presentation", () => {
  let restoration: ReplaySubject<AuthSession | null>
  let router: Router
  let fixture: ComponentFixture<App>
  let rejectNavigation: boolean
  let failNavigation: boolean

  beforeEach(() => {
    restoration = new ReplaySubject(1)
    rejectNavigation = false
    failNavigation = false
    loginConstructed.mockClear()
    protectedConstructed.mockClear()
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: "", pathMatch: "full", redirectTo: "login" },
          {
            path: "login",
            component: LoginProbe,
            canActivate: [() => !rejectNavigation, guestGuard]
          },
          {
            path: "admin",
            component: AdminProbe,
            canActivate: [authGuard],
            children: [
              { path: "", pathMatch: "full", redirectTo: "users" },
              { path: "users", component: UsersProbe }
            ]
          },
          {
            path: "retry",
            component: LoginProbe,
            canActivate: [
              () => {
                if (failNavigation) throw new Error("Navigation unavailable")
                return !rejectNavigation
              }
            ]
          }
        ]),
        { provide: AuthStore, useValue: { restoreSession: () => restoration } }
      ]
    })
  })

  function create() {
    router = TestBed.inject(Router)
    fixture = TestBed.createComponent(App)
  }

  function expectNeutral() {
    const root: HTMLElement = fixture.nativeElement
    expect(root.textContent).toContain("The Real Maids")
    expect(root.textContent).toContain("Operaciones y servicios")
    expect(root.querySelector("h1")?.textContent).toBe("Preparando tu espacio")
    const statuses = root.querySelectorAll('[role="status"]:not([aria-hidden="true"])')
    expect(statuses).toHaveLength(1)
    expect(statuses[0].getAttribute("aria-live")).toBe("polite")
    expect(statuses[0].textContent?.trim()).toBe("Cargando…")
    const spinner = statuses[0].querySelector("hlm-spinner")
    expect(spinner?.getAttribute("aria-hidden")).toBe("true")
    expect(spinner?.classList.contains("motion-safe:animate-spin")).toBe(true)
    expect(root.querySelector("form, input, router-outlet")).toBeNull()
    expect(loginConstructed).not.toHaveBeenCalled()
    expect(protectedConstructed).not.toHaveBeenCalled()
  }

  async function render() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  it("keeps server presentation neutral even after successful route selection", async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    create()
    restoration.next(null)
    await router.navigateByUrl("/login")
    await render()
    expectNeutral()
  })

  it("keeps the browser neutral while restoration is pending, then constructs only login", async () => {
    create()
    fixture.detectChanges()
    const navigation = router.navigateByUrl("/")
    await vi.waitFor(() => expect(restoration.observed).toBe(true))
    fixture.detectChanges()
    expectNeutral()
    restoration.next(null)
    expect(await navigation).toBe(true)
    await render()
    expect(loginConstructed).toHaveBeenCalledOnce()
    expect(protectedConstructed).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('input[type="password"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull()
  })

  it("defers an early NavigationEnd until the first browser render", async () => {
    create()
    restoration.next(null)
    await router.navigateByUrl("/login")
    expect(loginConstructed).not.toHaveBeenCalled()
    // Capture the completed first DOM before mixedReadWrite callbacks open the gate.
    // TestBed's tick can flush both the initial and follow-up renders in one call.
    let firstHtml = ""
    TestBed.runInInjectionContext(() =>
      afterNextRender({
        earlyRead: () => {
          firstHtml = fixture.nativeElement.innerHTML
        }
      })
    )
    await render()
    expect(firstHtml).toContain("The Real Maids")
    expect(firstHtml).toContain("Preparando tu espacio")
    expect(firstHtml).toContain("Cargando")
    expect(firstHtml).not.toMatch(/<form|<input|<router-outlet/)
    expect(loginConstructed).toHaveBeenCalledOnce()
  })

  it("follows authenticated redirect cancellation without ever constructing login and stays open on logout", async () => {
    create()
    fixture.detectChanges()
    const cancellations: (NavigationCancellationCode | undefined)[] = []
    router.events.subscribe(event => {
      if (event instanceof NavigationCancel) {
        cancellations.push(event.code)
        fixture.detectChanges()
        expectNeutral()
      }
    })
    const navigation = router.navigateByUrl("/")
    await vi.waitFor(() => expect(restoration.observed).toBe(true))
    expectNeutral()
    restoration.next(AuthSession.create("Test", "test@example.test"))
    expect(await navigation).toBe(true)
    await render()
    expect(cancellations).toContain(NavigationCancellationCode.Redirect)
    expect(router.url).toBe("/admin/users")
    expect(protectedConstructed).toHaveBeenCalledOnce()
    expect(loginConstructed).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('[name="protected-data"]')).not.toBeNull()
    restoration.next(null)
    await router.navigateByUrl("/login")
    await render()
    expect(loginConstructed).toHaveBeenCalledOnce()
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull()
  })

  it("continues neutral through a superseded navigation", async () => {
    create()
    fixture.detectChanges()
    const first = router.navigateByUrl("/login")
    await vi.waitFor(() => expect(restoration.observed).toBe(true))
    const second = router.navigateByUrl("/admin/users")
    expect(await first).toBe(false)
    fixture.detectChanges()
    expectNeutral()
    restoration.next(AuthSession.create("Test", "test@example.test"))
    expect(await second).toBe(true)
    await render()
    expect(protectedConstructed).toHaveBeenCalledOnce()
    expect(loginConstructed).not.toHaveBeenCalled()
  })

  it("retries a cancelled initial URL even when it equals the router's current URL", async () => {
    create()
    fixture.detectChanges()
    rejectNavigation = true
    restoration.next(null)
    expect(await router.navigateByUrl("/")).toBe(false)
    await render()
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull()
    rejectNavigation = false
    fixture.nativeElement.querySelector("button").click()
    await render()
    expect(router.url).toBe("/login")
    expect(loginConstructed).toHaveBeenCalledOnce()
  })

  it.each(["rejection", "error"])("offers retry after terminal navigation %s", async failure => {
    create()
    fixture.detectChanges()
    rejectNavigation = failure === "rejection"
    failNavigation = failure === "error"
    await router.navigateByUrl("/retry").catch(() => false)
    await render()
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      "No se pudo abrir"
    )
    expect(fixture.nativeElement.querySelector("form, input")).toBeNull()
    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull()
    rejectNavigation = false
    failNavigation = false
    const button: HTMLButtonElement = fixture.nativeElement.querySelector("button")
    expect(button.textContent).toContain("Reintentar")
    button.click()
    await render()
    expect(router.url).toBe("/retry")
    expect(loginConstructed).toHaveBeenCalledOnce()
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull()
  })
})
