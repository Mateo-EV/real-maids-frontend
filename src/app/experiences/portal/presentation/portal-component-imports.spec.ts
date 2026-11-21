import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  expectNamedImportEntries,
  portalComponentSources
} from "./portal-component-imports.testing"

/**
 * Every portal component source, by hand, so the guard is also a census: a new portal page (or the
 * shell) has to appear here in the same slice that creates it, and no component can silently keep a
 * `*Imports` constant that only breaks once the dev server re-applies its metadata in the browser.
 */
const portalComponents = [
  "presentation/components/portal-shell/portal-shell.ts",
  "presentation/pages/portal-profile-page/portal-profile-page.ts",
  "presentation/pages/portal-request-detail-page/portal-request-detail-page.ts",
  "presentation/pages/portal-requests-page/portal-requests-page.ts",
  "presentation/pages/portal-service-detail-page/portal-service-detail-page.ts",
  "presentation/pages/portal-services-page/portal-services-page.ts",
  "presentation/pages/portal-support-create-page/portal-support-create-page.ts",
  "presentation/pages/portal-support-detail-page/portal-support-detail-page.ts",
  "presentation/pages/portal-support-page/portal-support-page.ts"
].map(path => join("src/app/experiences/portal", path))

describe("Portal component metadata", () => {
  it("guards every portal component source, not only the pages measured in the browser", () => {
    expect(portalComponentSources()).toEqual([...portalComponents].sort())
  })

  describe.each(portalComponents)("%s", source => {
    it("declares direct dependency values, never a spread of an imported *Imports constant", () => {
      expectNamedImportEntries(source)
    })
  })
})
