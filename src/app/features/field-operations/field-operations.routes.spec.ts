import { createEnvironmentInjector, EnvironmentInjector } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { ViewService } from "@ngneat/overview"
import { HotToastService } from "@ngxpert/hot-toast"
import { describe, expect, it } from "vitest"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideCatalogToast } from "@/app/shared/notifications/catalog-toast"
import { appConfig } from "@/app/core/config/app.config"
import { FIELD_OPERATIONS_ROUTES } from "./field-operations.routes"
import { StaffPage } from "./presentation/pages/staff-page/staff-page"
import { StaffDetailPage } from "./presentation/pages/staff-detail-page/staff-detail-page"
import { StaffAbsencesReviewPage } from "./presentation/pages/staff-absences-review-page/staff-absences-review-page"
import { FieldStaffStore } from "./presentation/state/field-staff.store"

// WP7 T4 / S1,S3: public route metadata and real environment-injector boundaries.
describe("FIELD_OPERATIONS_ROUTES", () => {
  it("orders directory, static own profile, HR absence queue and dynamic staff detail", () => {
    // The two static paths precede `:id`, so neither resolves as a staff record.
    expect(FIELD_OPERATIONS_ROUTES.map(route => route.path)).toEqual(["", "me", "absences", ":id"])
    expect(FIELD_OPERATIONS_ROUTES[1].data).toEqual({ ownStaffProfile: true })
    expect(FIELD_OPERATIONS_ROUTES[2].data?.["ownStaffProfile"]).not.toBe(true)
    expect(FIELD_OPERATIONS_ROUTES[3].data?.["ownStaffProfile"]).not.toBe(true)
  })

  it.each([
    ["", StaffPage],
    ["me", StaffDetailPage],
    ["absences", StaffAbsencesReviewPage],
    [":id", StaffDetailPage]
  ] as const)(
    "lazy loads the actual %s consumer behind the existing auth guard",
    async (path, page) => {
      const route = FIELD_OPERATIONS_ROUTES.find(candidate => candidate.path === path)
      expect(route, `Missing staff feature route: ${path}`).toBeDefined()
      expect(route!.canActivate).toEqual([authGuard])
      expect(route!.component).toBeUndefined()
      expect(route!.loadComponent).toBeTypeOf("function")
      expect(await route!.loadComponent!()).toBe(page)
    }
  )

  it("owns complete shared toast scopes per route while inheriting the root stores", () => {
    expect(FIELD_OPERATIONS_ROUTES).toHaveLength(4)
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const root = TestBed.inject(EnvironmentInjector)
    const reference = createEnvironmentInjector(provideCatalogToast(), root)
    const scopes = FIELD_OPERATIONS_ROUTES.map(route =>
      createEnvironmentInjector(route.providers ?? [], root)
    )
    try {
      const rootStaff = root.get(FieldStaffStore)
      const rootAuth = root.get(AuthStore)
      const toasts = scopes.map(scope => scope.get(HotToastService, null, { self: true }))
      const views = scopes.map(scope => scope.get(ViewService, null, { self: true }))
      scopes.forEach((scope, index) => {
        expect(toasts[index]).not.toBeNull()
        expect(views[index]).not.toBeNull()
        expect(toasts[index]!.defaultConfig).toEqual(reference.get(HotToastService).defaultConfig)
        expect(scope.get(FieldStaffStore, null, { self: true })).toBeNull()
        expect(scope.get(AuthStore, null, { self: true })).toBeNull()
        expect(scope.get(FieldStaffStore)).toBe(rootStaff)
        expect(scope.get(AuthStore)).toBe(rootAuth)
      })
      expect(new Set(toasts).size).toBe(4)
      expect(new Set(views).size).toBe(4)
    } finally {
      scopes.forEach(scope => scope.destroy())
      reference.destroy()
    }
  })
})
