import { Routes } from "@angular/router"
import { describe, expect, it } from "vitest"
import { routes } from "./app.routes"
import { AUTH_ROUTES } from "./features/auth/auth.routes"
import { ADMIN_ROUTES } from "./experiences/admin/admin.routes"
import { authGuard, guestGuard } from "./features/auth/presentation/guards/auth.guard"
import { LoginPage } from "./features/auth/presentation/pages/login-page/login-page"
import { AdminHomePage } from "./experiences/admin/presentation/pages/admin-home-page/admin-home-page"

const loadRouteSets = async (): Promise<Routes[]> =>
  Promise.all(
    routes.filter(route => route.loadChildren).map(route => route.loadChildren!() as Promise<Routes>)
  )

describe("Application route composition", () => {
  it("preserves the default and wildcard login redirects", () => {
    expect(routes[0]).toEqual({ path: "", pathMatch: "full", redirectTo: "login" })
    expect(routes.at(-1)).toEqual({ path: "**", redirectTo: "login" })
  })

  it("keeps login as the only auth-owned route", () => {
    expect(AUTH_ROUTES.map(route => route.path)).toEqual(["login"])
  })

  it("composes separate lazy auth and admin route sets without local providers", async () => {
    const lazyRoutes = routes.filter(route => route.loadChildren)
    const routeSets = await loadRouteSets()

    expect(lazyRoutes.map(route => route.path)).toEqual(["", ""])
    expect(lazyRoutes.every(route => route.providers === undefined)).toBe(true)
    expect(routeSets[0]).toBe(AUTH_ROUTES)
    expect(routeSets[1]).toBe(ADMIN_ROUTES)
    expect(routeSets.map(set => set.map(route => route.path))).toEqual([["login"], ["admin/users", "admin"]])
  })

  it("preserves page lazy loading, titles and guards", async () => {
    const composed = (await loadRouteSets()).flat()
    const login = composed.find(route => route.path === "login")!
    const admin = composed.find(route => route.path === "admin")!

    expect(login.title).toBe("Iniciar sesión | The Real Maids")
    expect(login.canActivate).toEqual([guestGuard])
    expect(await login.loadComponent!()).toBe(LoginPage)
    expect(admin.title).toBe("Inicio | The Real Maids")
    expect(admin.canActivate).toEqual([authGuard])
    expect(await admin.loadComponent!()).toBe(AdminHomePage)
    expect(composed.every(route => route.providers === undefined)).toBe(true)
  })
})
