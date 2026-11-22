import { provideRouter, Router, Routes } from "@angular/router"
import { RenderMode } from "@angular/ssr"
import { TestBed } from "@angular/core/testing"
import { RouterTestingHarness } from "@angular/router/testing"
import { beforeEach, describe, expect, it } from "vitest"
import { routes } from "./app.routes"
import { serverRoutes } from "./app.routes.server"
import {
  isPublicSitePath,
  PUBLIC_SITE_PATHS
} from "./features/landing/presentation/routing/public-site"
import { AUTH_ROUTES } from "./features/auth/auth.routes"
import { ADMIN_ROUTES } from "./experiences/admin/admin.routes"
import { PORTAL_ROUTES } from "./experiences/portal/portal.routes"
import { STAFF_ROUTES } from "./experiences/staff/staff.routes"
import { authGuard, guestGuard } from "./features/auth/presentation/guards/auth.guard"
import { LoginPage } from "./features/auth/presentation/pages/login-page/login-page"
import { AdminShell } from "./experiences/admin/presentation/components/admin-shell/admin-shell"
import { LandingPage } from "./features/landing/presentation/pages/landing-page/landing-page"
import { LandingQuotePage } from "./features/landing/presentation/pages/landing-quote-page/landing-quote-page"
import { LandingWorkPage } from "./features/landing/presentation/pages/landing-work-page/landing-work-page"
import { LandingFaqPage } from "./features/landing/presentation/pages/landing-faq-page/landing-faq-page"
import { LandingReviewsPage } from "./features/landing/presentation/pages/landing-reviews-page/landing-reviews-page"

const loadRouteSets = async (): Promise<Routes[]> =>
  Promise.all(
    routes
      .filter(route => route.loadChildren)
      .map(route => route.loadChildren!() as Promise<Routes>)
  )

describe("Application route composition", () => {
  it("serves the public landing at the site root and keeps the wildcard login redirect", async () => {
    const root = routes[0]

    expect(root.path).toBe("")
    expect(root.pathMatch).toBe("full")
    expect(root.redirectTo).toBeUndefined()
    expect(root.title).toBe("The Real Maids | House cleaning in Tampa Bay")
    expect(await root.loadComponent!()).toBe(LandingPage)
    // The root is public marketing, so it carries no audience guard.
    expect(root.canActivate).toBeUndefined()
    expect(routes.at(-1)).toEqual({ path: "**", redirectTo: "login" })
  })

  it("keeps the remaining public landing pages at root paths without a guard", async () => {
    const publicPage = (path: string) => routes.find(route => route.path === path)!

    expect(await publicPage("quote").loadComponent!()).toBe(LandingQuotePage)
    expect(await publicPage("work-with-us").loadComponent!()).toBe(LandingWorkPage)
    expect(await publicPage("faq").loadComponent!()).toBe(LandingFaqPage)
    expect(await publicPage("reviews").loadComponent!()).toBe(LandingReviewsPage)

    for (const path of ["", "quote", "work-with-us", "faq", "reviews"]) {
      expect(publicPage(path).canActivate).toBeUndefined()
      expect(publicPage(path).canMatch).toBeUndefined()
    }
  })

  it("redirects the former /landing URLs to the root paths", () => {
    const legacyRedirects = routes.filter(route => route.path?.startsWith("landing"))

    // Absolute targets: a relative one resolves against the route's own `landing/` prefix and sends
    // `/landing/quote` back to itself.
    expect(legacyRedirects.map(route => [route.path, route.redirectTo])).toEqual([
      ["landing", "/"],
      ["landing/quote", "/quote"],
      ["landing/work-with-us", "/work-with-us"],
      ["landing/faq", "/faq"],
      ["landing/reviews", "/reviews"]
    ])
  })

  it("keeps login as the only auth-owned route", () => {
    expect(AUTH_ROUTES.map(route => route.path)).toEqual(["login"])
  })

  it("composes separate lazy auth, admin, portal and staff route sets without local providers", async () => {
    const lazyRoutes = routes.filter(route => route.loadChildren)
    const routeSets = await loadRouteSets()

    expect(lazyRoutes.map(route => route.path)).toEqual(["", "", "", ""])
    expect(lazyRoutes.every(route => route.providers === undefined)).toBe(true)
    expect(routeSets[0]).toBe(AUTH_ROUTES)
    expect(routeSets[1]).toBe(ADMIN_ROUTES)
    expect(routeSets[2]).toBe(PORTAL_ROUTES)
    // WP11 T2/S3: the field staff experience is a fourth, independently loaded family.
    expect(routeSets[3]).toBe(STAFF_ROUTES)
    expect(routeSets.map(set => set.map(route => route.path))).toEqual([
      ["login"],
      ["admin"],
      ["portal"],
      ["staff"]
    ])
  })

  it("preserves page lazy loading, titles and guards", async () => {
    const composed = (await loadRouteSets()).flat()
    const login = composed.find(route => route.path === "login")!
    const admin = composed.find(route => route.path === "admin")!

    expect(login.title).toBe("Iniciar sesión | The Real Maids")
    expect(login.canActivate).toEqual([guestGuard])
    expect(await login.loadComponent!()).toBe(LoginPage)
    // P02/W4: the empty admin path is the dashboard entry, no longer a users redirect.
    expect(admin.children?.[0].path).toBe("")
    expect(admin.children?.[0].pathMatch).toBe("full")
    expect(admin.children?.[0].redirectTo).toBeUndefined()
    expect(admin.children?.[0].loadChildren).toBeTypeOf("function")
    expect(admin.children?.[1].path).toBe("users")
    expect(admin.canActivate).toEqual([authGuard])
    expect(await admin.loadComponent!()).toBe(AdminShell)
    expect(composed.every(route => route.providers === undefined)).toBe(true)
  })

  // WP11 T2/S3: the third protected experience is guarded by the same shared decision.
  it("protects the staff experience with the shared audience guard", async () => {
    const staff = (await loadRouteSets()).flat().find(route => route.path === "staff")!
    expect(staff.canActivate).toEqual([authGuard])
    expect(staff.loadComponent).toBeTypeOf("function")
    expect(staff.children?.[0].path).toBe("")
    expect(staff.children?.[0].pathMatch).toBe("full")
    expect(staff.children?.[0].redirectTo).toBe("services")
    expect(staff.children?.[1].path).toBe("services")
    expect(staff.children?.[1].title).toBe("Mis servicios | The Real Maids")
    expect(staff.children?.[1].loadComponent).toBeTypeOf("function")
    expect(staff.children?.[1].canActivate).toBeUndefined()
    expect(staff.children?.[1].providers).toBeUndefined()
  })
})

describe("Static rendering of the public site", () => {
  it("prerenders every public page plus login, and leaves the rest client-rendered", () => {
    const prerenderedPaths = serverRoutes
      .filter(route => route.renderMode === RenderMode.Prerender)
      .map(route => route.path)

    // S1: the build emits real HTML for the marketing pages, which is only true because the root
    // component renders the outlet for them (see `isPublicSitePath`).
    expect(prerenderedPaths).toEqual([...PUBLIC_SITE_PATHS, "login"])
    expect(serverRoutes.at(-1)).toEqual({ path: "**", renderMode: RenderMode.Client })
  })

  it.each(PUBLIC_SITE_PATHS.map(path => [path === "" ? "/" : `/${path}`, path]))(
    "pairs the prerendered %s with its unguarded public route",
    (url, path) => {
      const route = routes.find(candidate => candidate.path === path)!

      // The prerender is only useful when the same URL also renders the page without a session.
      expect(isPublicSitePath(url)).toBe(true)
      expect(route.loadComponent).toBeTypeOf("function")
      expect(route.canActivate).toBeUndefined()
      expect(route.canMatch).toBeUndefined()
      expect(route.loadChildren).toBeUndefined()
    }
  )

  it("does not prerender a private experience or the wildcard", () => {
    for (const path of ["login", "change-password", "admin", "portal", "staff", "**"]) {
      expect(isPublicSitePath(`/${path}`)).toBe(false)
    }
    expect(serverRoutes.filter(route => route.path === "**")).toHaveLength(1)
  })
})

describe("Public landing navigation through the composed routes", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] })
  })

  it.each([
    ["/", LandingPage],
    ["/quote", LandingQuotePage],
    ["/work-with-us", LandingWorkPage],
    ["/faq", LandingFaqPage],
    ["/reviews", LandingReviewsPage]
  ])("renders %s for a visitor without a session", async (url, component) => {
    const harness = await RouterTestingHarness.create(url as string)
    await harness.fixture.whenStable()

    expect(TestBed.inject(Router).url).toBe(url)
    expect(harness.routeDebugElement!.componentInstance).toBeInstanceOf(component)
  })

  it.each([
    ["/landing", "/"],
    ["/landing/quote", "/quote"],
    ["/landing/work-with-us", "/work-with-us"],
    ["/landing/faq", "/faq"],
    ["/landing/reviews", "/reviews"]
  ])("resolves the former %s to the new public path %s", async (from, to) => {
    await RouterTestingHarness.create(from)

    expect(TestBed.inject(Router).url).toBe(to)
  })
})
