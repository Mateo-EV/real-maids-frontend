import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { TestBed } from "@angular/core/testing"
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree
} from "@angular/router"
import { firstValueFrom, isObservable, Observable, of } from "rxjs"
import { describe, expect, it } from "vitest"
import { authGuard, guestGuard, passwordChangeGuard, portalGuard } from "./auth.guard"

/** WP10 T2/S4: each role reaches its own experience; the forced password change wins. */
const customerSession = (mustChangePassword = false) =>
  AuthSession.create(
    "Cliente Portal",
    "cliente@example.test",
    "CLIENTE",
    null,
    9,
    4,
    "es",
    [],
    mustChangePassword
  )
const staffSession = (mustChangePassword = false) =>
  AuthSession.create(
    "Operador",
    "operador@example.test",
    "Administrador",
    null,
    3,
    2,
    "es",
    [],
    mustChangePassword
  )

type Decision = boolean | UrlTree

function setup(session: AuthSession | null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthStore,
        useValue: {
          session: () => session,
          restoreSession: () => of(session),
          logout: () => undefined
        }
      }
    ]
  })
}

async function decide(
  guard: typeof authGuard,
  url: string,
  returnUrl?: string
): Promise<{ value: Decision; serialized: boolean | string }> {
  const route = {
    queryParamMap: convertToParamMap(returnUrl === undefined ? {} : { returnUrl })
  } as ActivatedRouteSnapshot
  const result = TestBed.runInInjectionContext(() =>
    guard(route, { url } as RouterStateSnapshot)
  ) as Observable<Decision> | Promise<Decision> | Decision
  const value = isObservable(result) ? await firstValueFrom(result) : await result
  const router = TestBed.inject(Router)
  return { value, serialized: typeof value === "boolean" ? value : router.serializeUrl(value) }
}

describe("portal audience guards", () => {
  it.each([
    ["/admin", staffSession()],
    ["/admin/users?offset=0&limit=10", staffSession()],
    ["/admin/customers/7", staffSession()],
    ["/admin", AuthSession.create("Sin rol", "sinrol@example.test")]
  ])("keeps staff on the admin experience: %s", async (url, session) => {
    setup(session)
    expect((await decide(authGuard, url as string)).serialized).toBe(true)
  })

  it.each(["/admin", "/admin/users", "/admin/support/7"])(
    "sends a customer from the admin experience to the portal: %s",
    async url => {
      setup(customerSession())
      expect((await decide(authGuard, url)).serialized).toBe("/portal")
    }
  )

  it.each(["/portal", "/portal/requests", "/portal/requests?offset=20&limit=10"])(
    "keeps a customer inside the portal: %s",
    async url => {
      setup(customerSession())
      expect((await decide(portalGuard, url)).serialized).toBe(true)
    }
  )

  it.each([
    ["/portal", staffSession()],
    ["/portal/requests?offset=20", staffSession()],
    ["/portal", AuthSession.create("Sin rol", "sinrol@example.test")]
  ])("sends staff from the portal to the admin experience: %s", async (url, session) => {
    setup(session)
    expect((await decide(portalGuard, url as string)).serialized).toBe("/admin")
  })

  it("keeps the captured URL when an anonymous visit is sent to login", async () => {
    setup(null)
    expect((await decide(authGuard, "/admin/users")).serialized).toBe(
      "/login?returnUrl=%2Fadmin%2Fusers"
    )
    TestBed.resetTestingModule()
    setup(null)
    expect((await decide(portalGuard, "/portal/requests?offset=20")).serialized).toBe(
      "/login?returnUrl=%2Fportal%2Frequests%3Foffset%3D20"
    )
  })

  it.each([
    ["/admin/users", "/change-password?returnUrl=%2Fadmin%2Fusers", authGuard],
    ["/portal/requests", "/change-password?returnUrl=%2Fportal%2Frequests", portalGuard]
  ])(
    "takes the pending password change over the audience rule: %s",
    async (url, expected, guard) => {
      setup(customerSession(true))
      expect((await decide(guard, url as string)).serialized).toBe(expected)
    }
  )

  it("sends an authenticated visit to login to its own experience", async () => {
    setup(customerSession())
    expect((await decide(guestGuard, "/login")).serialized).toBe("/portal")
    TestBed.resetTestingModule()
    setup(staffSession())
    expect((await decide(guestGuard, "/login")).serialized).toBe("/admin")
    TestBed.resetTestingModule()
    setup(customerSession(true))
    expect((await decide(guestGuard, "/login")).serialized).toBe(
      "/change-password?returnUrl=%2Fadmin"
    )
  })

  it.each([
    ["/admin/users", "/portal", customerSession()],
    ["/admin/users", "/admin/users", staffSession()],
    ["/portal/requests", "/portal/requests", customerSession()],
    ["/portal/requests", "/admin", staffSession()]
  ])(
    "moves a settled session from the change screen to an honest destination: %s",
    async (returnUrl, expected, session) => {
      setup(session)
      const decision = await decide(passwordChangeGuard, "/change-password", returnUrl)
      expect(decision.serialized).toBe(expected)
    }
  )

  it("keeps a provisional session on the change screen", async () => {
    setup(customerSession(true))
    expect(
      (await decide(passwordChangeGuard, "/change-password", "/portal/requests")).serialized
    ).toBe(true)
  })

  it("does not loop: the redirected destination is allowed for the same session", async () => {
    setup(customerSession())
    const first = await decide(authGuard, "/admin/users")
    expect(first.serialized).toBe("/portal")
    expect((await decide(portalGuard, "/portal")).serialized).toBe(true)
    TestBed.resetTestingModule()
    setup(staffSession())
    const back = await decide(portalGuard, "/portal/requests")
    expect(back.serialized).toBe("/admin")
    expect((await decide(authGuard, "/admin")).serialized).toBe(true)
  })
})
