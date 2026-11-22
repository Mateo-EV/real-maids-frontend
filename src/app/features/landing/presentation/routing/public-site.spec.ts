import { describe, expect, it } from "vitest"
import { isPublicSitePath, PUBLIC_SITE_PATHS } from "./public-site"

describe("Public site paths", () => {
  it.each(PUBLIC_SITE_PATHS.map(path => (path === "" ? "/" : `/${path}`)))(
    "treats %s as a public page",
    url => {
      expect(isPublicSitePath(url)).toBe(true)
    }
  )

  it("accepts the absolute document URL the prerenderer and the browser report", () => {
    expect(isPublicSitePath("https://therealmaids.test/")).toBe(true)
    expect(isPublicSitePath("http://localhost:4000/quote?utm=mail#top")).toBe(true)
    expect(isPublicSitePath("/reviews/")).toBe(true)
  })

  it("keeps the former /landing URLs on the public side because they only redirect there", () => {
    expect(isPublicSitePath("/landing")).toBe(true)
    expect(isPublicSitePath("/landing/faq")).toBe(true)
  })

  it.each([
    "/login",
    "/change-password",
    "/admin",
    "/admin/users",
    "/portal/requests",
    "/staff/services/12",
    "/unknown-path"
  ])("keeps %s behind the private loading boundary", url => {
    expect(isPublicSitePath(url)).toBe(false)
  })

  it("does not match a public name as a prefix of another segment", () => {
    expect(isPublicSitePath("/quotes")).toBe(false)
    expect(isPublicSitePath("/landingx")).toBe(false)
    expect(isPublicSitePath("/faq/extra")).toBe(false)
  })
})
