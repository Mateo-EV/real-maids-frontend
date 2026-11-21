import { describe, expect, it } from "vitest"
import {
  ADMIN_HOME,
  PORTAL_HOME,
  audienceOf,
  audienceRedirect,
  destinationForRole,
  homeForRole,
  isCustomerRole
} from "./audience-navigation"

/** The backend's own role name (`CuentaClienteService.ROL_CLIENTE`): identity, never an ACL. */
const customer = "CLIENTE"
const staff = "Administrador"

describe("portal audience navigation", () => {
  it("identifies the customer audience only by the backend role name", () => {
    expect(isCustomerRole(customer)).toBe(true)
    // Transport padding is not a different role.
    expect(isCustomerRole("  CLIENTE  ")).toBe(true)
    for (const value of [
      "",
      " ",
      "Cliente",
      "cliente",
      "CLIENTES",
      staff,
      "Operaciones",
      null,
      undefined
    ])
      expect(isCustomerRole(value), String(value)).toBe(false)
  })

  it("maps each role to its own experience", () => {
    expect(homeForRole(customer)).toBe(PORTAL_HOME)
    for (const value of [staff, "Operaciones", "", null, undefined])
      expect(homeForRole(value), String(value)).toBe(ADMIN_HOME)
  })

  it("recognizes the owning experience of a URL and leaves neutral URLs alone", () => {
    expect(audienceOf("/portal")).toBe("portal")
    expect(audienceOf("/portal/requests?offset=20&limit=10")).toBe("portal")
    expect(audienceOf("/portal/requests/7#top")).toBe("portal")
    expect(audienceOf("/admin")).toBe("admin")
    expect(audienceOf("/admin/users")).toBe("admin")
    expect(audienceOf("/admin/operations/requests/7?offset=0&limit=20")).toBe("admin")
    for (const value of [
      "/login",
      "/change-password?returnUrl=%2Fadmin",
      "/portalx",
      "/administrator",
      "",
      null,
      undefined
    ])
      expect(audienceOf(value), String(value)).toBeNull()
  })

  it("redirects only a wrong audience", () => {
    expect(audienceRedirect("/admin", customer)).toBe(PORTAL_HOME)
    expect(audienceRedirect("/admin/users?offset=0", customer)).toBe(PORTAL_HOME)
    expect(audienceRedirect("/portal/requests", staff)).toBe(ADMIN_HOME)
    expect(audienceRedirect("/portal", "")).toBe(ADMIN_HOME)
    expect(audienceRedirect("/portal/requests", customer)).toBeNull()
    expect(audienceRedirect("/admin/users", staff)).toBeNull()
    expect(audienceRedirect("/admin", null)).toBeNull()
    // Audience-neutral destinations are never rewritten.
    for (const url of ["/login", "/change-password?returnUrl=%2Fadmin"]) {
      expect(audienceRedirect(url, customer)).toBeNull()
      expect(audienceRedirect(url, staff)).toBeNull()
    }
  })

  it("cannot loop: the destination of a wrong-audience redirect is allowed for that role", () => {
    for (const role of [customer, staff, null]) {
      for (const url of ["/admin", "/admin/users", "/portal", "/portal/requests"]) {
        const target = audienceRedirect(url, role)
        if (target !== null) expect(audienceRedirect(target, role), `${role} at ${url}`).toBeNull()
      }
    }
  })

  it("keeps an honest post-login destination for the session role", () => {
    expect(destinationForRole(null, customer)).toBe(PORTAL_HOME)
    expect(destinationForRole("/admin/users", customer)).toBe(PORTAL_HOME)
    expect(destinationForRole("/portal/requests", customer)).toBe("/portal/requests")
    expect(destinationForRole("/admin/users", staff)).toBe("/admin/users")
    expect(destinationForRole("/portal/requests", staff)).toBe(ADMIN_HOME)
    expect(destinationForRole("/admin", null)).toBe(ADMIN_HOME)
    // The existing unsafe/destination contract still decides first.
    expect(destinationForRole("//malicious.example", customer)).toBe(PORTAL_HOME)
    expect(destinationForRole("../relative", staff)).toBe(ADMIN_HOME)
    expect(destinationForRole("/login", staff)).toBe(ADMIN_HOME)
    expect(destinationForRole("/change-password?returnUrl=%2Fx", staff)).toBe(ADMIN_HOME)
  })
})
