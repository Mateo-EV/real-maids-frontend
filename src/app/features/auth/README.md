# Auth — M01/RF01/HU01/P01

Authentication and session boundary for the internal application and, from WP10, for the customer
portal accounts. The backend's business validation and authorization remain authoritative: this
feature decides **whether a person is authenticated**, never what they may do.

## Connected implementation

| Layer            | Files                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Domain           | `domain/entities/auth-session.entity.ts`, `domain/params/`, `domain/errors/auth.error.ts` |
| Transport        | `infrastructure/source/auth-http.source.ts`, `infrastructure/http/`                       |
| Repository       | `infrastructure/repositories/auth.repository-impl.ts`                                     |
| Use cases        | `application/use-cases/` (`login`, `logout`, `get-current-user`, `change-password`, …)    |
| Root state       | `presentation/state/auth.store.ts`                                                        |
| Guards           | `presentation/guards/auth.guard.ts`                                                       |
| Routes and pages | `auth.routes.ts` (`/login`), `presentation/pages/login-page/`, `change-password-page/`    |
| Session storage  | `infrastructure/session/auth-persistent-session.ts`                                       |

Credential persistence is the approved temporary localStorage candidate for **access and refresh**
tokens only. No profile, flag or authorization decision is persisted: identity is always re-read
through `GET /api/auth/me`.

## Forced password change on first sign-in (WP10 T16 / S10)

An administrator may define the provisional password of a portal account (WP10 T14/T15). The backend
persists `debeCambiarPassword` and returns it in `POST /api/auth/login` and `GET /api/auth/me`; until
it is cleared, the account must not use the rest of the application.

- **The flag travels with the validated profile.** `infrastructure/http/auth-response.ts` reads
  `debeCambiarPassword` with the same strict style as every other profile field and stores it in
  `AuthSession.mustChangePassword`.
- **Missing flag fails closed.** A response without the key (or with `null`) is treated as **`true`**:
  it cannot prove the provisional password was already replaced, so the change step is forced.
  Only an explicit `false` lets the session through. A non-boolean value is an `INVALID_PROFILE`
  response. Consequence to keep in mind: if a deployed backend ever stopped sending the flag, every
  authenticated session would be forced into the change screen instead of silently skipping it.
- **Routing matrix.** `/change-password` is the only screen a provisional session may render:

  | Situation                                          | Result                                       |
  | -------------------------------------------------- | -------------------------------------------- |
  | `authGuard` with `mustChangePassword: true`        | `/change-password?returnUrl=<requested URL>` |
  | `authGuard` with `mustChangePassword: false`       | the route                                    |
  | `guestGuard` (`/login`) with a provisional session | `/change-password?returnUrl=/admin`          |
  | `guestGuard` with a settled session                | `/admin`                                     |
  | `passwordChangeGuard` with a provisional session   | stays on the screen                          |
  | `passwordChangeGuard` with a settled session       | the captured destination                     |
  | `passwordChangeGuard` without a session            | `/login?returnUrl=<captured destination>`    |

  `safeDestination()` accepts only internal, non-login, non-change-screen URLs, so a captured URL can
  never loop or leave the application. The login page applies the same decision after
  `authenticated`, keeping the original `returnUrl` as the destination of the change screen.

- **The change itself** (`PUT /api/auth/me/password`) sends `{ passwordActual, passwordNueva }` with
  the bytes exactly as typed, through `authContext()` (no interceptor renewal/replay) and a manual
  bearer. `400` maps to `INVALID_PASSWORD_CHANGE`; raw backend text never reaches the UI. A rejected
  change keeps the session, the flag and the draft.
- **Confirmation is a read, not an assumption.** `ChangePasswordUseCase` chains one forced
  `GET /api/auth/me` (`me(true)`, bypassing the published profile snapshot) and returns the refreshed
  session. The screen navigates to the destination only when that profile already reports
  `mustChangePassword: false`. If the write was accepted but the read failed, the outcome is
  **unconfirmed**: the screen says so and offers a GET-only retry (`refreshSession()`), never a
  replay of the password write — the new password now matches the stored hash, so a repeated `PUT`
  would be rejected by the backend.
- **No new way out, and no trap.** The screen always exposes `Cerrar sesión` (local clear + best
  effort revocation + `/login`), and there is no "skip" that keeps the session. `refreshSession()`
  keeps a verified session when the read fails, so a transient failure cannot log the person out or
  silently mark the step as done.
- **Unchanged:** login, refresh rotation, logout, the interceptor, both existing guards' session
  semantics, credential storage and its keys. SSR still reads no storage and dispatches no auth
  request; `/change-password` uses the default client render mode.

### Evidence and pending acceptance

Deterministic Vitest coverage exists for the flag validation (present/absent/null/non-boolean), the
redirect matrix, the SSR path, the transport (`PUT` body, bearer, 204, `400`/`401`/`403`/`5xx`,
network, unconfigured origin, server platform, cancellation), the use case, the store, the form
(policy, confirmation, unchanged password, duplicate submit, rejection, unconfirmed retry,
destruction) and the page (destination, fallbacks, sign-out).

Not verified here: a live backend/CORS run, the real `debeCambiarPassword` round trip, the actual
policy messages from the server, the "other sessions closed" side effect, browser
keyboard/responsive checks in Chrome/Edge/Firefox and independent/native review.
