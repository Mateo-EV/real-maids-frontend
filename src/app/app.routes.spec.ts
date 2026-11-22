import { Routes } from "@angular/router"
import { describe, expect, it } from "vitest"
import { routes } from "./app.routes"
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

    expect(legacyRedirects.map(route => [route.path, route.redirectTo])).toEqual([
      ["landing", ""],
      ["landing/quote", "quote"],
      ["landing/work-with-us", "work-with-us"],
      ["landing/faq", "faq"],
      ["landing/reviews", "reviews"]
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
