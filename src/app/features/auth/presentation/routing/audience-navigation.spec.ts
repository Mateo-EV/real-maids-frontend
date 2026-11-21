import { describe, expect, it } from "vitest"
import {
  ADMIN_HOME,
  FIELD_STAFF_ROLE_NAME,
  PORTAL_HOME,
  STAFF_HOME,
  audienceOf,
  audienceRedirect,
  destinationForRole,
  homeForRole,
  isCustomerRole,
  isFieldStaffRole
} from "./audience-navigation"

/** The backend's own role name (`CuentaClienteService.ROL_CLIENTE`): identity, never an ACL. */
const customer = "CLIENTE"
/** WP11 S3: the label `PerfilResponse.rol` returns for the field staff seed role. */
const fieldStaff = "PERSONAL_CAMPO"
const staff = "Administrador"

/** WP11 S3/S4: the three authenticated experiences and the home each one owns. */
const roleHomes = [
  [customer, PORTAL_HOME],
  [fieldStaff, STAFF_HOME],
  [staff, ADMIN_HOME]
] as const
const urlFamilies = [
  [PORTAL_HOME, "/portal/requests?offset=0&limit=20"],
  [STAFF_HOME, "/staff/services"],
  [ADMIN_HOME, "/admin/users"]
] as const

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
    // WP11 T2/S3: the field staff label owns the third experience and nothing else does.
    expect(homeForRole(fieldStaff)).toBe(STAFF_HOME)
    for (const value of [staff, "Operaciones", "", null, undefined])
      expect(homeForRole(value), String(value)).toBe(ADMIN_HOME)
  })

  it("identifies the field staff audience only by the backend role label", () => {
    expect(FIELD_STAFF_ROLE_NAME).toBe(fieldStaff)
    expect(isFieldStaffRole(fieldStaff)).toBe(true)
    expect(isFieldStaffRole("  PERSONAL_CAMPO  ")).toBe(true)
    for (const value of [
      "",
      " ",
      "personal_campo",
      "Personal_Campo",
      "PERSONAL CAMPO",
      "PERSONAL_CAMPOS",
      customer,
      staff,
      null,
      undefined
    ])
      expect(isFieldStaffRole(value), String(value)).toBe(false)
    // The two audiences are disjoint: neither predicate claims the other's label.
    expect(isCustomerRole(fieldStaff)).toBe(false)
    expect(isFieldStaffRole(customer)).toBe(false)
  })

  it("recognizes the owning experience of a URL and leaves neutral URLs alone", () => {
    expect(audienceOf("/portal")).toBe("portal")
    expect(audienceOf("/portal/requests?offset=20&limit=10")).toBe("portal")
    expect(audienceOf("/portal/requests/7#top")).toBe("portal")
    expect(audienceOf("/admin")).toBe("admin")
    expect(audienceOf("/admin/users")).toBe("admin")
    expect(audienceOf("/admin/operations/requests/7?offset=0&limit=20")).toBe("admin")
    // WP11 T2/S3: `/staff` is a third family, not a child of the backoffice.
    expect(audienceOf("/staff")).toBe("staff")
    expect(audienceOf("/staff/services")).toBe("staff")
    expect(audienceOf("/staff/services?page=2&size=10#top")).toBe("staff")
    for (const value of [
      "/login",
      "/change-password?returnUrl=%2Fadmin",
      "/portalx",
      "/administrator",
      "/staffx",
      "/staffing",
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
    // WP11 T2/S3: the field staff label owns `/staff` and is sent out of the other two.
    expect(audienceRedirect("/admin/users", fieldStaff)).toBe(STAFF_HOME)
    expect(audienceRedirect("/portal/requests", fieldStaff)).toBe(STAFF_HOME)
    expect(audienceRedirect("/staff/services", fieldStaff)).toBeNull()
    expect(audienceRedirect("/staff/services", staff)).toBe(ADMIN_HOME)
    expect(audienceRedirect("/staff/services", customer)).toBe(PORTAL_HOME)
    expect(audienceRedirect("/staff/services", null)).toBe(ADMIN_HOME)
    // Audience-neutral destinations are never rewritten.
    for (const url of ["/login", "/change-password?returnUrl=%2Fadmin"]) {
      expect(audienceRedirect(url, customer)).toBeNull()
      expect(audienceRedirect(url, staff)).toBeNull()
      expect(audienceRedirect(url, fieldStaff)).toBeNull()
    }
  })

  // WP11 T2/S3: three roles against three URL families. Each cell answers either "allowed" or the
  // home of the audience that owns the session, so a wrong-audience URL always lands where the same
  // decision allows it and no session can bounce between experiences.
  it("applies the three-audience matrix and stays symmetric on re-evaluation", () => {
    for (const [role, home] of roleHomes) {
      for (const [familyHome, url] of urlFamilies) {
        const expected = familyHome === home ? null : home
        const redirect = audienceRedirect(url, role)
        expect(redirect, `${role} at ${url}`).toBe(expected)
        const destination = redirect ?? url
        expect(audienceRedirect(destination, role), `${role} at ${destination}`).toBeNull()
        // The destination belongs to the audience of the session, never to the other one.
        if (redirect !== null) expect(audienceOf(redirect)).toBe(home.split("/")[1])
      }
      // Every neutral URL keeps the session where it is, whatever its audience is.
      for (const url of ["/login", "/change-password?returnUrl=%2Fstaff"]) {
        expect(audienceRedirect(url, role), `${role} at ${url}`).toBeNull()
      }
    }
  })

  it("cannot loop: the destination of a wrong-audience redirect is allowed for that role", () => {
    for (const role of [customer, fieldStaff, staff, null]) {
      for (const url of [
        "/admin",
        "/admin/users",
        "/portal",
        "/portal/requests",
        "/staff",
        "/staff/services"
      ]) {
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
    // WP11 T2/S3: the field staff session lands on its own experience, never on the backoffice.
    expect(destinationForRole(null, fieldStaff)).toBe(STAFF_HOME)
    expect(destinationForRole("/staff/services", fieldStaff)).toBe("/staff/services")
    expect(destinationForRole("/admin/users", fieldStaff)).toBe(STAFF_HOME)
    expect(destinationForRole("/portal/requests", fieldStaff)).toBe(STAFF_HOME)
    expect(destinationForRole("/staff/services", staff)).toBe(ADMIN_HOME)
    expect(destinationForRole("/staff/services", customer)).toBe(PORTAL_HOME)
    // The existing unsafe/destination contract still decides first.
    expect(destinationForRole("//malicious.example", customer)).toBe(PORTAL_HOME)
    expect(destinationForRole("../relative", staff)).toBe(ADMIN_HOME)
    expect(destinationForRole("/login", staff)).toBe(ADMIN_HOME)
    expect(destinationForRole("/change-password?returnUrl=%2Fx", staff)).toBe(ADMIN_HOME)
  })
})
