# Dashboard — P02

Oversight surface for M10/RF13/HU13/P12 and M11/RF14/HU14/P02. It reads the backend's own aggregates and does
no arithmetic of its own: every count, amount and rate is printed exactly as supplied.

`/admin` opens this page. Before WP9 the empty admin child redirected to `users`; the dashboard replaces that
temporary redirect.

## Connected implementation

| Layer        | Files                                                                            |
| ------------ | -------------------------------------------------------------------------------- |
| Transport    | `infrastructure/source/dashboard-http.source.ts`, `dashboard-http.validation.ts` |
| Repository   | `infrastructure/repositories/dashboard.repository-impl.ts`                       |
| Use case     | `application/use-cases/get-dashboard.use-case.ts`                                |
| Root state   | `presentation/state/dashboard.store.ts`                                          |
| Route + page | `dashboard.routes.ts`, `presentation/pages/dashboard-page/`                      |

`GET /api/dashboard?desde&hasta` requires `DASHBOARD_LEER` and defaults the window to the last 30 days.

## Decisions this implementation encodes

- **No cross-visit cache.** Entering reads once; only an explicit refresh re-reads. There is no TTL and no
  polling, so a settled read is never replayed — which means **a new subscription is a new read**. The page
  therefore owns exactly one subscription (`Subject` + `switchMap` + `takeUntilDestroyed`) and the template never
  calls a subscribing method, so change detection cannot open a request.
- **A window owns its numbers.** If the requested window differs from the one in the entry, the store clears the
  result and shows loading: one window's totals are never labelled with another window's dates. The page shows
  the period the server returned, not the one typed.
- **Verified zero is data.** A real zero renders as zero; it is never collapsed into "no data".
- **403 is an error.** A missing permission renders an explicit `DASHBOARD_LEER` error, never an empty board: an
  empty board and a denied board look identical to a reader.
- **Figures are verbatim.** `montoCompletado`, `horas` and `tasaCumplimiento` arrive as decimals and are kept as
  canonical text; no rounding, no re-scaling, no percentage conversion. `tasaCumplimiento` is null when the
  backend had no closures and is rendered as absent, not as 0.
- **`pathMatch: "full"` with `loadChildren`** on the empty admin child is load-bearing: an empty-path prefix child
  with a lazy group would swallow `/admin/users`, `/admin/customers` and the rest of the shell.

## Acceptance boundary

Verified by this feature's tests: request and parameter mapping, strict response decoding (state map, series,
collaborator load, nullable rate, canonical decimals), error mapping including 403, one read per entry and per
accepted window, verified data retained through a failed or in-flight refresh, verified zero versus absence, and
`/admin` rendering the dashboard without disturbing the other admin children.

**Not verified here**: live backend/CORS, real permission outcomes, the live JSON serialization of the decimal
fields, browser acceptance (Chrome/Edge/Firefox, responsive and keyboard) and exhaustive accessibility.

Two open items belong to acceptance, not code: if the backend ever serializes those decimals as JSON strings the
decoder rejects them by design, and the units of `tasaCumplimiento` (fraction or percentage) are undocumented, so
no unit bound is applied.

Reports, the generated-report history and the CSV export are **not** part of this capability yet: they live in
`features/reports-settings/` and their generation is a side effect over `GET`, so it must stay behind an explicit
user action.
