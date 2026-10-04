import { describe, expect, it } from "vitest"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { USERS_ROUTES } from "./users.routes"
import { UsersPage } from "./presentation/pages/users-page/users-page"

describe("USERS_ROUTES", () => {
  it("lazy loads the standalone demo page behind the existing auth guard", async () => {
    const route = USERS_ROUTES[0]
    expect(route.path).toBe("")
    expect(route.canActivate).toEqual([authGuard])
    expect(route.title).toBe("Usuarios | The Real Maids")
    expect(await route.loadComponent!()).toBe(UsersPage)
  })
})
