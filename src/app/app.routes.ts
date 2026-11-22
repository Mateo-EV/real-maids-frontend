import { passwordChangeGuard } from "./features/auth/presentation/guards/auth.guard"
import { Routes } from "@angular/router"

export const routes: Routes = [
  {
    // Public marketing landing at the site root. It replaces the former `"" -> login` redirect: an
    // unauthenticated visitor now reads the site instead of being sent to the sign-in form, which is
    // still reachable at `/login` and is where the wildcard sends unknown paths.
    path: "",
    pathMatch: "full",
    title: "The Real Maids | House cleaning in Tampa Bay",
    loadComponent: () =>
      import("./features/landing/presentation/pages/landing-page/landing-page").then(
        component => component.LandingPage
      )
  },
  {
    path: "",
    loadChildren: () => import("./features/auth/auth.routes").then(routes => routes.AUTH_ROUTES)
  },
  {
    // WP10 T16: the forced first-sign-in password change. It needs an authenticated session, keeps a
    // provisional one here and sends a settled one to the destination it carries. Composed here so
    // the auth lazy set keeps `/login` as its only route.
    path: "change-password",
    title: "Cambiar contraseña | The Real Maids",
    canActivate: [passwordChangeGuard],
    loadComponent: () =>
      import("./features/auth/presentation/pages/change-password-page/change-password-page").then(
        component => component.ChangePasswordPage
      )
  },
  {
    // The rest of the public marketing site. Declared before the guarded lazy groups and unguarded
    // on purpose: the admin, portal and staff families keep their own audience guards.
    path: "quote",
    title: "Get a Quote | The Real Maids",
    loadComponent: () =>
      import("./features/landing/presentation/pages/landing-quote-page/landing-quote-page").then(
        component => component.LandingQuotePage
      )
  },
  {
    path: "work-with-us",
    title: "Work With Us | The Real Maids",
    loadComponent: () =>
      import("./features/landing/presentation/pages/landing-work-page/landing-work-page").then(
        component => component.LandingWorkPage
      )
  },
  {
    path: "faq",
    title: "FAQ | The Real Maids",
    loadComponent: () =>
      import("./features/landing/presentation/pages/landing-faq-page/landing-faq-page").then(
        component => component.LandingFaqPage
      )
  },
  {
    path: "reviews",
    title: "Reviews | The Real Maids",
    loadComponent: () =>
      import("./features/landing/presentation/pages/landing-reviews-page/landing-reviews-page").then(
        component => component.LandingReviewsPage
      )
  },
  // The landing first shipped under `/landing`; those URLs keep working as redirects so an already
  // shared link does not break.
  { path: "landing", pathMatch: "full", redirectTo: "" },
  { path: "landing/quote", pathMatch: "full", redirectTo: "quote" },
  { path: "landing/work-with-us", pathMatch: "full", redirectTo: "work-with-us" },
  { path: "landing/faq", pathMatch: "full", redirectTo: "faq" },
  { path: "landing/reviews", pathMatch: "full", redirectTo: "reviews" },
  {
    path: "",
    loadChildren: () =>
      import("./experiences/admin/admin.routes").then(routes => routes.ADMIN_ROUTES)
  },
  {
    // WP10 T2/S4: the customer experience. Its own lazy group and shell, guarded by the same
    // audience decision that keeps a customer out of `/admin`.
    path: "",
    loadChildren: () =>
      import("./experiences/portal/portal.routes").then(routes => routes.PORTAL_ROUTES)
  },
  {
    // WP11 T2/S3: the field staff experience. Its own lazy group and shell, guarded by the same
    // audience decision, so a `PERSONAL_CAMPO` session stays here and every other role is sent to
    // the experience it owns.
    path: "",
    loadChildren: () =>
      import("./experiences/staff/staff.routes").then(routes => routes.STAFF_ROUTES)
  },
  {
    path: "**",
    redirectTo: "login"
  }
]
