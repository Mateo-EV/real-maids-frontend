# Product scope and journeys

The Real Maids frontend is a responsive web application for managing cleaning services internally and giving customers a portal to follow their requests and services and contact customer support. This guide preserves the functional plan; it does not certify implemented features. See [the Spanish project overview](../README.md) for onboarding and current status, and [agent instructions](../AGENTS.md) for technical, security and quality rules.

For the proposed delivery sequence, presentation target and reference-adaptation gates, see the [implementation roadmap](implementation-roadmap.md). It preserves the official model and existing visual structure; it does not authorize implementation or certify planned features.

## Current delivery boundary

P01 (M01/RF01/HU01) retains `/login` prerendering with an accessible neutral loading screen, without constructing login fields or protected content. The browser reveals only the selected route after session restoration and the first successful navigation, deferred until after the initial hydration-compatible render. Redirect and superseded-navigation cancellations keep the gate closed; terminal navigation failures show an accessible retry action. Once revealed, later navigation and logout do not close the gate again. Auth contracts, guards, storage, store lifetimes and route render modes are unchanged. Unit/router checks and prerender inspection do not certify real authenticated timing or Chrome/Edge/Firefox visual, keyboard and responsive acceptance; those remain pending.

P01 (M01/RF01/HU01) has a T2 candidate adapting documented login to nested `usuario`, access/refresh credentials and strict runtime profile/lifetime validation. The user explicitly superseded memory-only storage with temporary localStorage persistence for both credentials: versioned, backend-origin-bound and browser-only, with acknowledged JavaScript/XSS exposure. No profile or permission authorization is trusted from storage; reload uses real `GET /api/auth/me`. Access expiry can renew via public JSON refresh, using single-flight and origin-wide Web Locks with fail-closed behavior when unavailable. Rotation cannot extend the original session deadline. Source invalidation/renewal reaches the root store through repository/application contracts. Explicit logout clears locally immediately and sends a bounded best-effort credential snapshot to documented logout; offline failure is not reported as remote revocation success. Login replacement, cancellation, expiry and destruction do not silently perform remote logout. The functional Bearer interceptor is configured explicitly and limited to validated API-origin `/api/` paths; public auth/internal requests skip renewal and no request is replayed after 401. SSR/prerender does not access browser storage, create shared credentials, request auth or transfer-cache tokens. The profile uses returned IDs/name/role/language/permission strings, never role-name/JWT inference; unused last access is not assigned an invented null. Development permits the existing localhost:8080 API origin; production remains unconfigured until an approved HTTPS origin is set. T2 closure, live backend/CORS, real multi-tab browser acceptance and rendered keyboard/responsive checks remain pending. Permanent persistence/cookies and role-aware navigation remain open. The shell retains its broad IAM demonstration notice pending IAM closure; the T3 boundary below distinguishes real user operations from remaining simulations. `/admin` loads a reusable protected shell with a child outlet and temporarily redirects to `/admin/users`, not P02. The shell owns brand, shared session identity and logout. Its generated Helm sidebar supports desktop/mobile navigation: IAM, CRM and RRHH are enabled links; CRM retains its exact label, General placement, icon and style and opens `/admin/customers`. RRHH opens the read-only staff directory at `/admin/staff` and profiles at `/admin/staff/me` and `/admin/staff/:id`; Landing, Cotizaciones and Programaciones remain disabled buttons without destinations (M02/RF02/HU02/P03, RNF06/RNF08/RNF09). Existing users tabs, catalog controls and desktop/mobile records remain feature-owned. The navy header's `Sistema seguro y activo` is requested static copy, not monitored security or backend health. Public build-time configuration supplies `Entorno: Desarrollo` or `Producción` through the production file replacement. The custom Spartan select uses domain `Lang`, defaults to Spanish and permits Spanish/English visual selection only; it neither translates nor persists preferences or mutates the session. Localization/fallback remains open.

M02 (RF02/HU02/P03) has a T3 HTTP integration candidate at protected `/admin/users`, reachable through IAM and the temporary `/admin` redirect. Root `UserStore`/`RolesStore`, stateless `execute()` use cases, repository interfaces and `useExisting` bindings keep their lifetimes and explicit repository/source boundary (RNF09/RNF10). User and role repositories now inject root HTTP sources; customers now injects root HTTP sources under its separately documented M03 boundary; T4 RBAC, T5 sessions and T6 audit inject root HTTP sources. Legacy IAM simulations remain unwired, never HTTP fallbacks. Legacy user/role sources remain test/demo fixtures, never HTTP fallbacks. Age and the demo ≥18 rule were removed from the entity, request contracts and editor. Returned IDs, profile dates and nullable last access are validated, not synthesized. Role names/IDs are not frontend permissions; backend authorization remains authoritative.

The page provides name/email search, role/status filters, pagination, user creation/editing/deletion confirmation and icon-only record actions with accessible names. By explicit user approval, the Users listing now queries server pages independently of the shared catalog (M02/RF02/HU02/P03, RNF06/RNF08/RNF09/RNF10/RNF12). It requests ten records with zero-based `pagina`, `tamanio`, name/email `busqueda`, `idRol` and `activo`; UI navigation remains one-based. `UserListQuery` extends shared `PaginationParams` with search/role/status filters; results directly use `PaginationResponse<User>` (`items`, `total`, `offset`, `limit`), without a separate listing page type. Optional pagination defaults to offset 0/limit 20; the UI initially requests limit 10. The HTTP source alone translates aligned offsets into `pagina=offset/limit` and `tamanio=limit`, validating safe integers, emitted int32 bounds, effective size, metadata consistency, page identity and unique IDs. It does not apply the shared normalizer's maximum of 100 or invent a backend maximum. Returned offset equals returned page times effective size. Active state adopts that actual offset/limit: a request at offset 20/limit 10 returning size 5 becomes offset 10/limit 5, and the next UI page requests offset 15/limit 5 (backend page 3). Effective-size stability across backend requests remains unverified. Server filtered totals and offset/limit-derived page counts and ranges drive the paginator; the visible records are not filtered or sliced locally. Search waits 250 ms, filters reset to page zero, and superseded reads are cancelled with stale-result protection. An empty out-of-range page allows one bounded clamp/refetch using the effective limit, including recovery to offset zero for an empty collection, not a loop. Unrelated queries never show another query's rows; same-query refreshes retain prior rows with an updating status or a visible retryable stale-data warning on failure. Retry preserves the failed query. The explicitly approved integration after backend commit `9439829` retires the fixed shared user array and its read contracts. One root UserStore owns writes and shared reactive entries keyed by normalized full queries: result, loading/refreshing/error, expiry and effective query metadata. Interfaces own only local query controls and lifecycle-scoped observation subscriptions; pure readonly projections select the root entry. There is no UserListStore, duplicate writable result state, fixed consumer namespace or singleton current query. Same-query interfaces share the exact read state; different keys remain independent. Active entries are pinned during history eviction. Entries become stale after two minutes (120000ms), checked on reads without polling, with a 20-variant cap to bound short navigation/search histories. Revisiting an expired cached query (including from a new consumer) immediately shows only that query's stored rows while revalidating in the background. Failed revalidation retains the stale entry and a retryable view error; only a successful read renews TTL, never a cache access. Identical in-flight requests share ref-counted cancellation; invalidation generations reject late results. Confirmed writes and PARTIAL_UPDATE invalidate every variant and background-refresh subscribed Users and Audit lookups, preserving same-query rows and partial mutation errors without replay. Users and Audit keep independent query/navigation controls, selecting matching root entries; selected audit actors survive mutation refreshes and catalog gaps. Logout, expiry or session replacement clears cached and visible user data and fences old requests; renewing credentials with the same identity and fixed session deadline does not invalidate the cache. SSR dispatches no user reads. The same root UserStore now owns one reactive global statistics entry, independent of list and mutation statuses; interfaces select readonly projections rather than providing UserStatisticsStore (M02/RF02/HU02/P03, RNF09/RNF10/RNF12). Statistics consume GET /api/usuarios/estadisticas, never current-page or fixture counts. Successful statistics reads are cached for 120000ms, checked on reads without polling; cache access and failed refresh never extend TTL. Expired revisits and explicit retries retain verified values, including zero, with updating or retryable stale-data feedback. Reads share ref-counted cancellation, so destroying one consumer cannot abort another; final cancellation settles status. Confirmed/PARTIAL_UPDATE writes invalidate statistics and refresh active observers once, without root-owned read subscriptions or a duplicate page reload. The monotonic mutation revision still refreshes session consumers through component-owned subscriptions, without a second statistics/list refresh. Statistics share UserStore's session clearing/generation fencing and SSR read prohibition, while same-session credential renewal preserves cached values. Dialogs retain selected User context and write actions only. Audit owns independent server-paged query controls selecting UserStore; Sessions owns server-paged summaries and disclosure-only detail state. Strict DTO/metadata validation, cancellation and stale-result protection remain. The approved transport cap is not a documented backend maximum; audit and RBAC contracts remain unchanged. For M02/RF02/HU02/P03, the power action replaces the disabled key action on desktop and mobile: Activate/Deactivate opens a confirmation showing the affected name/email and intended status change before mutation. It uses the dedicated `updateUserStatusById(id, isActive)` repository/use-case/store operation, sending the desired `activo` flag to documented `PATCH /api/usuarios/{id}/estado` and consuming the returned server profile. Creation/access dates are backend data; the frontend does not infer concurrency, self-account or last-administrator policy. Generic profile updates remain available. Pending progress blocks duplicate submission and dismissal; operation errors allow retry, and a success toast appears only after success. Filters and pagination remain in place, with the current page clamped to available results. This is real HTTP profile state, not a frontend ACL or a promise about immediate credential/session revocation. Pagination uses the reusable [table controls](../src/app/shared/components/table-pagination/table-pagination.ts) and a [bounded page-token helper](../src/app/shared/pagination/page-tokens.ts): at most seven numeric/ellipsis entries, with first/last pages and a current-page neighborhood. Ellipses are noninteractive; previous/next buttons retain boundary disabled states and the selected page exposes `aria-current`. The users controls select server pages independently of actor lookup and session summaries (M02/RF02/HU02/P03, RNF06/RNF08/RNF09); they do not deliver future table screens. Successful saves/deletions use `HotToastService` notifications instead of the inline success panel; both lazy Users and CRM routes call shared `provideCatalogToast()`, each owning `HotToastService`, `provideHotToastConfig()` and `ViewService` together so consumers and body-attached containers share their own route injector, without moving providers to root or importing Users into CRM. `angular.json` still includes global `@ngxpert/hot-toast/styles.css` for those overlays. Root repository/store lifetimes and bundle budgets are unchanged (RNF04/RNF09/RNF10/RNF12). There is no role-management launcher or modal; the real role catalog/store and user role selector remain. Retained administrative role mutations return `UNSUPPORTED`, without invented endpoints or demo writes. User dialogs close via Cancel, outside click or Escape when idle; all user dismissal and duplicate submission are blocked while an operation is pending (RNF06/RNF12). Component-owned login, user mutations and page catalog queries use DestroyRef cancellation and suppress late feedback after destruction. Users, Sessions, Roles/RBAC and Audit navigation is enabled within the same page; standalone credential management remains absent. The legacy in-memory sources still own fixtures for five roles and 48 users, with stable matching role IDs and max-ID allocation; real user CRUD never consumes those fixtures. Page entry independently queries listing, roles, statistics and exact session count; there is no initializer or sequential create-on-entry flow. RBAC waits only for roles, not user reads. Navigation queries do not seed backend records. Legacy fixtures live for their unwired source instance and never create a server auth session; HTTP session and audit records belong to the backend. The [fixture module](../src/app/features/users/presentation/demo/users-demo.fixture.ts) retains fictitious entity bindings, profile IP decoration and the former decorative audit count with integration TODOs; the audit metric now uses the returned server global log total. Identity/access provenance is marked directly in the in-memory source files. The entity-binding column and mobile card field are commented out, but their fixture data remains; invented profile IPs are no longer displayed. Remaining fixture IPs are decorative data, not monitored activity. The audit metric uses backend totalGlobal, independent of viewer filters and pagination; it is not today's activity or a security alert count. Session counts use the exact global server total at page zero/size one, never owner totals, array lengths or local expiry; pending/failed reads leave counts unverified. Repetitive future-tab, credential and UTC helper text was removed. User statistics use backend global counts; role counts use the role array. The Users paginator uses the server's filtered listing total. Sessions and audit consume their real HTTP contracts; legacy demo IDs never supply backend identity or activity. T4 permissions use the real catalog and assignments. Global navy primary/foreground and enabled-action hover are shared by users, dialogs, login and admin; gold accent and coral decoration remain distinct. Returned access dates are displayed explicitly in UTC; the operational timezone remains undecided.

### Retained RBAC and Audit section state

Within Users, RBAC and Audit are created only on their first visit and retained in hidden, inert wrappers when another section is selected. Revisiting checks freshness and revalidates expired reads without resetting the selected RBAC role or unsaved draft, or Audit's actor, filters, More filters panel and page. RBAC waits only for successful roles initialization, independently of listing/statistics/session-count failures. Hidden requests can finish; page destruction still cancels component-owned requests. Initial loading, errors and explicit retry remain available. This fixes local navigation continuity (M02/RF02/HU02/P03, RNF06/RNF08/RNF09/RNF10/RNF12), not persistence after leaving the page/reloading, new audit RF/HU, authorization or a performance/budget change. Browser keyboard/responsive acceptance remains pending.

### Capability-owned read freshness

M02/RF02/HU02/P03 and RNF09/RNF10/RNF12 guide consumer-triggered caching, not frontend authorization. UserStore queries/statistics remain at 120000ms; roles and session owners/exact count/per-user details also use 120000ms. RBAC permission catalog/per-role assignments and Audit full-query lists/global totals use 30000ms. Only successful server reads renew TTL; cache hits and failures do not. Explicit retries bypass freshness and affected writes invalidate immediately without replaying mutations. Session owner/count/detail invalidation precedes the forced post-user-mutation count read, with revision deduplication across parent/child consumers.

Shared in-flight requests use ref-counted cancellation; inactive histories are bounded and active views protected. Logout, expiry or session replacement clears and fences old reads, while same-session renewal preserves them; SSR dispatches no reads. Background revalidation keeps verified same-query rows/counts (including empty/zero), with accessible status/error/retry rather than unrelated results or false zero. Cached permissions/sessions are presentation data, never an ACL or proof of revocation. Auth lifecycle/security decisions, all writes, raw CSV export, uncached audit detail and customer writes are excluded. Customer presentation reads now use their separately approved policy: customers/details, properties, contacts/preferences and acquisition catalogs use 120000ms; leads/details, follow-ups and customer history use 30000ms. They reuse the shared read-resource and session scope, without polling or treating freshness as authorization. Live authenticated/CORS and Chrome/Edge/Firefox acceptance remain pending.

### Composable store reads

M02/RF02/HU02/P03 and RNF09/RNF10/RNF12 guide the separation of read mechanics from capability policy. The neutral [read resource](../src/app/shared/state/read-resource.ts) owns request sharing, success-only freshness, cancellation and obsolete-response fencing. Its typed adapter reads and patches the consuming SignalStore; it does not keep a second writable copy of the result. Forced-read joining versus replacement and invalidation cancellation are explicit policies, not a new common behavior imposed on consumers.

The [session read scope](../src/app/features/auth/presentation/state/session-read-scope.ts) belongs to Auth, not shared state: it initializes Auth lazily in the browser and observes identity plus the fixed session deadline. Stores supply their reset callback; same-session access renewal does not clear cached data. RolesStore, RbacStore, AuditLogsStore, UserStore and UserSessionsStore use both helpers. UserStore retains query-keyed pages and independent statistics; its active observers share one lazy refresh batch per mutation, including synchronous failed responses. UserSessionsStore keeps owner-page, exact-count and per-user-detail resources separate, including their verification markers and post-mutation refresh batches. Cache keys, admission/history bounds, observer lifetimes and mutations remain capability-owned. Auth lifecycle is not a read-resource cache. Customer presentation reads now reuse this coordinator under their explicitly approved per-capability TTL policy; customer writes remain uncached.

The read path is **consumer → store → read resource → use case → store adapter → readonly selector**. A fresh verified result is returned without HTTP; otherwise the resource coordinates a request. Only a successful current response renews freshness. An obsolete response cannot replace state, and cancellation is shared until the final subscriber leaves.

| Owner | Responsibility kept outside the shared coordinator |
| --- | --- |
| Roles | Catalog changes and aggregate read/write loading. |
| RBAC | Retained roles, assignment copies/identity, write guards and obsolete-result `BUSY` delivery. |
| Audit | Query identity, current-page projection and ordering between page-derived/global totals. |
| Users | Query admission/history, effective pagination, statistics and mutation observer fan-out. |
| Sessions | Owner queries, exact count, per-user verification markers and affected-read invalidation. |

A new cached read supplies a typed state adapter, request factory, error normalization, TTL and scope. `read()` checks admission/freshness; `invalidate()` makes verified data stale according to the consumer's cancellation policy; `reset()` cancels all flights and clears the read state. A registry may retain coordinators per key, but results stay only in the store. Do not use this mechanism to cache authentication decisions, writes or uncached exports.

### Shared catalog frame and feedback

Users and CRM both consume [CatalogFrame](../src/app/shared/components/catalog-frame/catalog-frame.ts) for consistent hierarchy, header/actions, table/card presentation and footer (M02/RF02/HU02/P03, M03/RF03/HU03/P04; RNF08/RNF09). Global styles switch to desktop records at 64rem of available container width. Users navigation/KPIs remain outside the frame and its filters remain feature-owned, projected into the header; CRM adds no invented filters/KPIs. Reference screens guide functionality/content, not visual authority.

The shared [toast provider factory](../src/app/shared/notifications/catalog-toast.ts) keeps services/configuration together in each lazy route; global toast CSS in `angular.json` is unchanged. CRM success toasts require confirmed writes and owner/session fencing; actionable errors remain inline and preserve drafts. No root feedback consumer, root provider movement or Users-feature coupling is added. The exact **CRM** label and model/API/store/session behavior remain unchanged. Corrected WP3 visual/manual/live/browser acceptance and WP2 acceptance are user-reported, not exhaustive agent-observed proof.

### Shared catalog filter styling

Users, Sessions, RBAC and Audit reuse the stateless opt-in `catalog-filter-row` / `catalog-filter-search` contract in [the global stylesheet](../src/styles.css), preserving the Users reference dimensions and search surface (M02/RF02/HU02/P03, RNF08/RNF09). Future catalog sections can follow [the usage guide](../README.md#filtros-de-catálogo-reutilizables) without copying feature overrides or introducing a wrapper component. Only opted-in rows receive the shared control heights and responsive search widths; labels, actions and bindings remain local, and Helm retains semantic borders/focus rings. Markup tests do not prove computed dimensions; rendered browser acceptance remains pending.

### Backend sessions — T5

M02/RF02/HU02/P03 uses GET /api/sesiones/usuarios for server name/email search, Todos/Con sesiones/Sin sesiones and initial five-owner pages. Summaries reuse shared offset/limit pagination, effective returned metadata and bounded out-of-range recovery. Returned names/emails/counts are authoritative; no user catalog, fabricated profiles or initial N+1 detail requests remain. Only opening a native keyboard-accessible `<details>` requests GET /api/usuarios/{id}/sesiones, with separate loading/error/retry. Exact global session metrics use GET /api/sesiones at page zero/size one, not owner totals, arrays or local expiry.

The existing root UserSessionsStore owns asynchronous owner entries keyed by normalized full query, alongside independent detail/count state and writes; there is no component-provided UserSessionOwnersStore. Components own only query controls, readonly selector projections and lifecycle-scoped observation subscriptions (M02/RF02/HU02/P03, RNF09/RNF10/RNF12). Same-key in-flight reads share result/loading/error and ref-counted cancellation; different queries remain independent. Successful owner/count/detail reads use a two-minute (120000ms) TTL checked on reads/revisits without polling. Owner/detail histories retain at most 20 inactive entries while active views remain pinned. Fresh revisits reuse the verified result; expired revisits preserve same-query data, including empty/zero, with visible refreshing or retryable stale-error feedback. A first failed read stays unverified, never a fabricated empty result. Confirmed session writes and user mutation revisions share one lazy refresh per active owner query, including synchronous responses and multiple observers, without duplicate component reloads or inactive root-owned HTTP subscriptions. Lazy AuthStore acquisition precedes source-session observation; logout, expiry or identity/session-deadline replacement clears session read data and fences late reads/writes. Same-session credential renewal preserves owner state. SSR performs no owner reads. Unknown DTOs, metadata, unique IDs, requested owner identity and current flags are validated. Pending/error/cancelled reads stay unverified and failures visible, never false zero or demo fallback. Confirmed revokes refresh the active summary, exact count and affected open detail at most once per read without optimistic totals or write replay. Refresh failure does not negate the confirmed revoke.

The caller-relative `actual` field identifies the current session; no token/storage marker is correlated with a server session ID. Its individual revoke is blocked with guidance to use Logout; backend 400 remains authoritative. Confirmation identifies user/device and prevents duplicate submission and pending dismissal. Empty successful 200/204 revocation responses are accepted, including already closed/expired sessions. Per-user reads remain available through repository/use-case contracts; bulk revoke also remains in the store, without a new UI launcher. Bulk revoke of the caller preserves the current session per the backend contract. Component cancellation suppresses late feedback but cannot roll back a dispatched backend mutation.

Root store lifetimes, stateless use cases and the distinct useExisting repository/source boundary remain (RNF09/RNF10). SSR does not dispatch session HTTP requests or transfer-cache them. The old registry is unwired test/demo data, never a fallback. UTC display does not select an operational timezone. Live authenticated backend/CORS and Chrome/Edge/Firefox visual, keyboard and responsive acceptance remain pending (RNF06/RNF08/RNF12).

The editor follows documented password validation: creation requires 8–64 characters with uppercase, lowercase and a digit, while a blank edit preserves the existing password. Password bytes are never trimmed or stored in user identity. Create sends the documented profile/password fields; editing sends profile `PUT`, desired status `PATCH` only when changed, then optional `PUT /api/usuarios/{id}/password` with `passwordNueva`. Since WP10 T15 (section below), selecting the catalog's CLIENTE role in a **new** alta warns that a customer will be created, requires its `tipo`, accepts an optional `telefono` and sends those two account-only fields only for that role; every other role keeps the previous payload and a `403` on that alta names the missing `CLIENTE_CREAR` permission. This sequence is not atomic: later failure returns `PARTIAL_UPDATE`, refreshes server profile state and does not show success. Cancellation after dispatch cannot guarantee rollback; no writes are replayed automatically. Transport/DTO failures return safe typed errors, including forbidden, duplicate email and not found, without raw backend details. Browser/CORS/authenticated backend acceptance and visual/responsive/keyboard checks in Chrome, Edge and Firefox remain pending; simulated HTTP tests and a build do not certify live behavior.

M03/RF03/HU03 and RF12/HU12 now have a [real HTTP/application boundary](../src/app/features/customers/README.md) for customer profiles/state/accounts, properties, acquisition, contacts/preferences and permission-aware history, requiring paged customer backend contract `f7988fb` or newer. Customer reads use server active-only pages with shared offset/limit domain contracts, actual returned totals/effective metadata and stable name/ID ordering. Backend commit `a6f7141` adds `busqueda` (trimmed, case-insensitive literal substring on name/email; blank omitted; `%`, `_` and backslash are literal) and exact `tipo` (`residencial`/`comercial`, invalid values return 400), applied before pagination. They never slice a downloaded full catalog or infer page totals from mutations. Stateless named use cases delegate through explicitly bound root repositories to validated HTTP sources. The demo is unwired, never a fallback. Customer removal is deactivation, not physical deletion; conversion uses current lead data (the unchanged Spanish prospect API contract) and returns the same linked customer on repeats, without email merging or inferred stage changes, and its optional portal account is described under WP10 T17. Angular uses Lead/LeadOrigin/LeadFollowUp and leadId internally, including Quote/WebForm linkage; Spanish wire fields/routes and Java names stay unchanged. The root store preserves its lifetime and clears/fences session-old work. The approved customer presentation cache policy uses 120000ms for customer pages/details, properties, contacts/preferences and acquisition catalogs, and 30000ms for leads/details, follow-ups and customer history. Root capability stores reuse the shared read-resource/session-scope pattern with caller-owned subscriptions, same-key stale feedback and confirmed-write invalidation. WP1–WP2 now connect a protected lazy read-only P04 list at `/admin/customers`, through the existing **CRM** sidebar entry, without changing the official shell/theme, IAM or default users redirect. The page shows name/type/email/phone as a desktop table/mobile cards and starts with offset 0/limit 20. Shared pagination uses actual total/effective offset/limit, without client-side slicing or invented counters. Debounced name/email search and immediate exact customer-type filtering are applied by the backend before paging; either control resets the offset, and the detail return URL retains only offset/limit. No status/tag filters are offered. Query-specific computed projections and component-owned observation subscriptions preserve root store TTL, invalidation, cancellation and session fencing. Loading, verified empty, retryable initial error, same-key stale rows during refresh/failure and unrelated-query isolation remain distinct. A successful positive-total empty out-of-range page permits one corrective query using the returned limit per navigation/retry; the transport/store never rewrites metadata, and a second empty result cannot loop. WP3 now connects local Signal Forms create/edit for name/type/email/phone (plus the optional portal-account intent superseded by the WP10 T14 section below) and contextual desired-false deactivation on desktop/mobile, with nullable replacements, pending dismissal/duplicate guards, safe actionable inline errors preserving drafts and confirmed-write success toasts fenced by owner/session lifetime. Captured loaded customer identity is independent of refreshed rows. Active store observers refresh confirmed writes once, without optimistic membership/totals or another page reload. Page/dialog destruction and session replacement cancel owned writes and fence late feedback; cancellation cannot roll back dispatched server effects. No direct Users-feature import, root feedback consumer, role inference, inactive discovery/reactivation or physical deletion is added. The bounded read-only WP4 slice below now adds detail/property consumers. The user reported manual WP2 acceptance; it is not agent-observed exhaustive Chrome/Edge/Firefox keyboard/responsive or live CORS testing. Corrected WP3 visual/manual/live/backend/browser acceptance is user-reported, not exhaustive agent-observed proof. Real MySQL locking/rollback evidence, full WP4 and subsequent gates remain pending. All other screens and the customer portal remain planned. IAM users/role catalog HTTP adapters are the T3 candidate; sessions and audit have T5–T6 HTTP adapters; enforced frontend role navigation, E2E and CI/CD remain absent; T4 connects permission catalog/assignment HTTP operations; auth persistence/transport is the T2 candidate, not a completed IAM capability; production deployment is unverified. Existing unit tests are not a claim of a newly verified pass or fixed test count.

### Bounded read-only customer detail and properties — WP4

M03/RF03/HU03/P04 and RNF01/RNF08–RNF10/RNF12: `/admin/customers/:id` connects customer detail and owner-scoped properties using the existing root stores, CatalogFrame/Helm hierarchy and route-local `provideCatalogToast()` scope. Desktop/mobile list detail links and the return action carry actual effective offset/limit; validated aligned safe page/size context restores the list before its first read, while malformed/missing pairs default to 0/20. Positive int32 IDs only dispatch reads. Existing active-only list paging, bounded recovery and profile actions remain unchanged.

Properties load only after successful owner detail, include inactive records and retain nullable/canonical decimal values (`areaM2` in m²). Profile and property loading, retryable initial failure, verified empty and same-owner stale refresh/error remain distinct. Route changes cancel previous owner subscriptions; session clearing and destruction fence data and owned reads. Supplied access instructions/door codes are instantiated only inside an opened native property disclosure, never its summary, list links, toast or URL. Backend authorization/redaction remains authoritative; client disclosure is not an ACL or security proof.

This slice has deterministic route/DOM/store-contract coverage, not rendered browser, live backend/CORS or sensitive-field redaction acceptance. User-reported corrected WP2/WP3 acceptance is preserved separately. Property create/edit and desired-status confirmation are connected by the second and third bounded slices below; bounded contacts, preferences and final read-only history consumers are connected below, and full WP4 acceptance is not complete. Repeatable next acceptance: CRM page → detail → open an authorized non-sensitive property → return to the effective server page; separately verify denied/cross-owner/redacted responses and Chrome/Edge/Firefox keyboard/responsive behavior without capturing access values.

### Bounded property create/edit — second WP4 slice

M03/RF03/HU03/P04 and RNF01/RNF08–RNF10/RNF12: the owner detail now exposes New property and Edit using explicit local Signal Forms and the existing root CustomerPropertiesStore. Edit captures a validated item from the loaded owner list, including inactive properties; no single-property GET or lifecycle mutation is invented. Required address/boolean pets and every nullable mutable field form the full POST/PUT replacement. Text is trimmed, blank optionals become null, zero counts remain zero, and bounded `areaM2` stays decimal text in m² until the existing adapter serializes it. Declarative field validation matches source bounds, including postal format, rooms 0–200, bathrooms 0–100 and area 1–999999.99 with at most two decimal places.

Helm dialogs retain customer name/ID context, safe inline errors/drafts and guarded pending duplicate/Cancel/Escape/outside behavior. Confirmed Result success alone produces a generic route-local toast and exactly one forced owner-property read. Property writes invalidate owner properties and history, but finite loadProperties calls do not auto-refresh like CustomersStore observers. No optimistic membership/totals, root feedback consumer or automatic write retry is added. Captured owner/session checks and subscriptions protect against route-ID reuse, page/dialog destruction, session replacement and closing animation; same-session renewal preserves work. Cancellation does not roll back dispatched writes.

Supplied access instructions/door codes are editable only within the intended property form, not summaries, URLs, notifications, logs or portal exposure. The form is not authorization and cannot certify field redaction. Deterministic payload/validation/error/pending/lifecycle tests and self-verification are separate from live backend/CORS, independent sensitive-owner/redaction verification and rendered Chrome/Edge/Firefox responsive/keyboard acceptance, all still pending. Prior corrected WP3 acceptance remains user-reported, not acceptance of this editor. The third bounded slice below connects property desired-state actions; no property deletion is delivered; the separately authorized contacts-only WP5 slice is described below and full WP4 acceptance is not finished. Acceptance script: CRM → owner detail → New property → invalid/valid submit → confirmed toast and one server revalidation → Edit a legitimately loaded item → return to the effective server page, using authorized non-sensitive data.

### Bounded property desired status — third WP4 slice

M03/RF03/HU03/P04 and RNF01/RNF08–RNF10/RNF12: Activate/Deactivate uses a legitimately loaded owner-list property, including inactive entries. The Helm confirmation captures owner/name, property alias/address/ID, current state and explicit desired boolean. It never renders access instructions/door codes. The existing CustomerPropertiesStore.setPropertyStatus(ownerId, propertyId, desired) delegates through the unchanged validated source; no DELETE, customer reactivation/discovery, new endpoint or role-name ACL is introduced.

One dialog at a time and pending guards block duplicate confirmation and Cancel/Escape/outside dismissal; idle dismissal remains available. Safe forbidden/conflict/network/not-found/invalid-response feedback preserves the selected confirmation for explicit retry, never raw error values. Only successful Result delivery emits a generic route-local activation/deactivation toast and one forced owner read. The store invalidates properties/history but finite reads do not auto-observe; rows, inactive membership and totals are never patched optimistically. Refreshed rows cannot change the captured target or desired state. Refresh failure remains visible without replaying the write.

The unchanged feature-local dialog lifecycle and captured owner/session checks cancel/fence route-owner changes, session loss/replacement and page/dialog destruction, including post-await closing-animation feedback. Same-session renewal preserves work; cancellation cannot undo backend writes already dispatched. Deterministic UI checks cover both desired states, errors/retry, pending/idle dismissal, single-dialog behavior and lifecycle fencing alongside the preserved read/editor tests. Exact test/build evidence belongs to the handoff, not manual acceptance. All three WP4 slices remain pending independent live/backend/CORS, sensitive-owner/redaction and Chrome/Edge/Firefox keyboard/responsive evidence. Prior WP2/WP3 acceptance is user-reported only; full WP4 is not accepted. The subsequent authorization connects only WP5 contacts below.

Pending acceptance: CRM → owner detail → Activate a loaded inactive property → confirm the named owner/property/state → verify generic feedback and one owner read → Deactivate → idle cancel/error/retry → return to the effective page. Use authorized non-sensitive data and independently verify denied/cross-owner/redacted responses without recording access values.

### Bounded contacts list/create/edit — first WP5 slice

M03/RF03/HU03/P04 and RNF01/RNF08–RNF10/RNF12: verified customer detail now mounts an owner-keyed contacts consumer with responsive CatalogFrame table/cards, existing Helm and route-local toast scope. It selects the root CustomerRelationsStore entry and owns finite loadContacts subscriptions; no local writable result cache or store lifetime change. Reads start only after verified profile success, include inactive contacts and distinguish unverified/loading/error, verified empty and same-owner stale refresh/failure. No preference/history UI, synthetic timeline, filters, global counts or ACL inferred from roles.

Explicit Signal Forms name/position/email/phone/isPrimary/isActive sends the full existing POST/PUT replacement. Trim text, send nullable blanks as null, preserve both booleans and captured owner/contact identity. Bounds match the adapter: 120/80/120/30, required nonblank name and optional valid email; contact phone has no adapter format rule beyond its length. Create defaults non-primary/active, edit includes inactive records. Status changes use full PUT only, not a lifecycle endpoint, DELETE or invented primary uniqueness.

Pending blocks duplicate saves and Cancel/Escape/outside dismissal. Safe inline errors preserve drafts and context; confirmed Result success alone emits generic feedback and exactly one forced owner-contact read. Store-owned contact/history invalidation does not auto-refetch these finite consumers: properties/preferences/history stay unread, rows/totals are not patched and writes never retry automatically. Failed revalidation visibly retains verified same-owner rows rather than falsely rolling back the confirmed write.

The unchanged dialog lifecycle, synchronous page ownerChanged$ cancellation, keyed owner views and captured generation fence owner/session/destruction/closing-animation completions. Same-session renewal preserves work; cancellation cannot undo dispatched writes. Public DOM/store-contract tests cover payloads, limits, failures, dismissal, stale reads and lifecycle behavior; preserved WP4 assertions retain property/detail/return-context checks. Exact test/build results belong to the handoff, not live acceptance.

Pending acceptance: CRM → detail → New contact → invalid/valid submit → generic confirmed toast and one owner read → edit an inactive loaded contact, clear optionals/change flags → return to the effective page. Use authorized non-sensitive records and independently verify backend/CORS, denials, owner/session changes and Chrome/Edge/Firefox keyboard/responsive behavior. The second bounded WP5 slice below connects preferences and the final slice connects read-only history; full WP5 and full WP4 independent acceptance remain pending. Prior user-reported WP2/WP3 satisfaction is not acceptance of contacts or preferences.

### Bounded preferences list/create/edit — second WP5 slice

M03/RF03/HU03/P04 and RNF01/RNF08–RNF10/RNF12: verified customer detail now includes owner-keyed preferences list/create/edit with the same CatalogFrame responsive table/cards, Helm/Signal Forms and route-local toast scope. Contacts/property behavior, return context, root store lifetimes and exact CRM label remain unchanged. Existing CustomerRelationsStore selectPreferences/loadPreferences retain finite consumer-owned subscriptions and the 120000ms success TTL. Inactive records remain visible; loading/unverified, verified empty, error/retry and verified same-owner stale refresh/failure stay distinct. Content is rendered as plain text, not HTML or interpreted links.

Full POST/PUT replaces propertyId/type/detail/isActive; update captures loaded owner/preference identity. Type is required trimmed free text up to 50, detail is required trimmed text without a documented maximum, and active is an explicit boolean. There is no invented type catalog, uniqueness/order rule, DELETE or independent status action/endpoint. Todo el cliente maps to null; property scope only uses positive int32 IDs from legitimately loaded same-owner properties, including inactive items. This reuses the detail's existing read without new property calls. Options contain only safe ID/alias/address/status context, never access instructions/door codes.

Actual loading/error/stale property-option feedback is visible; unavailable options do not become a fabricated verified empty catalog and general scope stays usable. An existing association absent from verified options keeps its ID without an invented name or silent general replacement; saving requires a valid owner choice or explicit change to Todo el cliente. The editor rechecks current choices at dispatch.

Pending guards prevent duplicate saves and Cancel/Escape/outside dismissal; safe failures retain drafts. Confirmed Result success alone emits a generic toast and exactly one forced owner-preference read, without contact/property/history reloads, optimistic rows/totals or automatic write retries. Store-owned preference/history invalidation remains unchanged; failed revalidation retains verified rows with visible stale error. Synchronous ownerChanged$, keyed views and unchanged dialog/session helpers cancel/fence owner/session/destruction work and closing-animation feedback; same-session renewal preserves it. Cancellation cannot roll back dispatched writes.

Pending acceptance: CRM → verified detail → New preference → general/loaded inactive property → invalid/valid save → inspect generic toast and one preference read → edit scope/active → return to the effective page. Deterministic DOM/store-contract checks and compilation are technical evidence only, not new live/browser acceptance. Prior WP2/WP3 acceptance remains user-reported. Backend/CORS, denied/cross-owner/sensitive redaction and Chrome/Edge/Firefox keyboard/responsive proof remain pending for these relation consumers. The final bounded slice below connects history UI and records the missing module restriction marker/current non-null support-description constraint. Full WP5 and independent WP4 acceptance remain pending; no fabricated permissions/restricted states, communications timeline, notes, email, calls or SMTP are introduced.

### Bounded official read-only history — final WP5 slice

After contacts/preferences commit `a4add4f`, the explicit continuation connects CustomerHistoryPanel only when the native history disclosure opens on verified customer detail (M03/RF03/HU03, RF12/HU12/P04; RNF01/RNF08–RNF10/RNF12). Root owner/limit state remains authoritative: normal open/revisit checks its 30000ms success TTL/invalidation with limit 20; explicit retry forces a read. Closing destroys/cancels the finite consumer. Owner changes cancel synchronously; logout/replacement/destruction fence old work, same-session renewal preserves it and SSR dispatches none.

One GET `/api/clientes/{id}/historial?tamanio=20` returns three pages at offset zero. Responsive section cards retain server order and independent requests/orders/support ranges/totals, plain text, supplied UTC dates, canonical amounts and known null absence. This is a bounded recent sample, not a complete catalog, combined activity total, communications timeline or independently navigable module API. No sensitive property access fields, writes, CSV, notes/email/calls/SMTP or role-name ACL are introduced.

The current domain/source has no module restriction marker. Empty results do not prove permissions or absence of all history. HTTP 403 or a malformed module fails the whole Result: one safe retryable error retains only verified same-owner stale data, never three invented empty/restricted states. Request description allows null; support description currently requires non-null text. Backend DTO/service/OpenAPI are unavailable in this workspace; support null remains `INVALID_RESPONSE`, not certified redaction or a reason to alter the parser.

Confirmed property create/edit/status callbacks and minimal contact/preference outputs force exactly one current-owner history read only while open, after existing store invalidation. Closed history waits for normal reopening. Original own-list refresh counts and dialog lifecycles remain unchanged; checks after feedback/list callbacks fence reentrant owner/session changes. Failed writes never notify; failed history refresh stays visible without write replay or false rollback. Deterministic public UI/store checks are technical evidence only. Independent live/backend/CORS, module authorization/redaction and Chrome/Edge/Firefox keyboard/responsive proof remain pending; full WP5 is not accepted and WP4 is not independently accepted. See the [customer boundary](../src/app/features/customers/README.md#connected-read-only-official-history-final-bounded-wp5-slice) for the repeatable acceptance path.

### Bounded read-only lead inbox — first WP6 slice

The authorized continuation connects `/admin/customers/leads` before customer `:id`, guarded by existing auth. Customer and lead lists share feature-local [Clientes/Prospectos navigation](../src/app/features/customers/presentation/components/crm-catalog-navigation/crm-catalog-navigation.ts); sidebar **CRM**, IAM, default users redirect and official visual hierarchy remain unchanged. The [inbox](../src/app/features/customers/presentation/pages/leads-page/leads-page.ts) reuses the existing root acquisition store, CatalogFrame/Helm responsive table/cards and shared pagination, initially 0/20. Actual server total/effective offset/limit drive ranges and navigation without local slicing/search/filtering. One positive-total empty out-of-range recovery per navigation/retry retains effective limit, without response rewriting or automatic loops.

The current inbox shows actual name/email/phone, converted labels and origin/stage name badges resolved through existing root catalogs, with independent loading/error/retry and explicit unavailable labels. Catalog reads reuse the 120000ms freshness and caller/session cancellation; there are no per-row lookups or invented names/statuses/linked customer IDs. The later slices below connect editor/create, follow-up and conversion; catalog administration remains undelivered. Read-only detail and real name links are connected by the second bounded slice below. Public quote/pricing/landing/SMTP remains outside scope. M03/RF03/HU03 supplies customer context; dedicated acquisition RF/HU remains missing, not invented. The remaining WP6 workflow is planned, not completed by this inbox.

Consumer-owned observeLeads/selectLeads projections preserve the existing 30000ms success TTL, same-query stale refreshing/error/retry, unrelated-query isolation and session/destruction/SSR safety. Queued recovery is fenced across session replacement/destruction; same-session renewal preserves work. Pending independent acceptance: CRM → Prospectos → next/previous → Clientes → IAM, plus empty/failure/stale retry checks with authorized non-sensitive data. Deterministic router/DOM/real-store checks and compilation are technical evidence only, not live backend/CORS, permission or Chrome/Edge/Firefox keyboard/responsive proof. WP6, full WP5 and independent WP4 acceptance remain open; previous WP2/WP3 user reports are unchanged.

### Bounded read-only lead detail and effective return — second WP6 slice

The [lead detail](../src/app/features/customers/presentation/pages/lead-detail-page/lead-detail-page.ts) at `/admin/customers/leads/:id` precedes customer `:id`, with the existing auth guard and route-local complete toast providers. Desktop/mobile lead name links carry actual returned offset/limit. An independent lead-route validator restores inbox initial URL context and the explicit back link; missing/malformed/duplicate, unaligned or unsafe page/size pairs default to 0/20. Customer query context remains unchanged. This proves explicit list → detail → return navigation, not native browser-back restoration from noncanonical list URLs.

Positive decimal int32 IDs alone dispatch `observeLead` reads; readonly `selectLead` projections retain root ownership, 30000ms success TTL, same-ID stale refresh/error/retry and session/SSR fencing. Route changes/destruction cancel owned observers; same-session renewal preserves work. Display only supplied fields: contacts, reference address, plain unbounded observation, UTC registration instant/actor, actual converted flag and explicit origin/stage IDs. Null remains unregistered; no catalog labels, linked customer identity, customer lookups, follow-ups or writes are invented.

M03/RF03/HU03 supplies context; missing dedicated acquisition RF/HU remains recorded. Editor/create, follow-ups, conversion/catalog administration and public quote/pricing/landing/SMTP remain planned or separately gated. Pending independent acceptance: CRM → Prospectos → effective page → lead name → inspect supplied fields → Volver a prospectos; verify denial/retry, session/route replacement and Chrome/Edge/Firefox keyboard/responsive behavior using authorized non-sensitive records. Deterministic router/DOM/real-store tests and compilation do not certify live backend/CORS/authorization. WP6 completion and independent WP4/WP5 acceptance remain pending.

### Bounded lead creation from inbox — third WP6 slice

The inbox now opens a create-only [LeadEditor](../src/app/features/customers/presentation/components/lead-editor/lead-editor.ts), superseding creation-as-planned in the two historical read-only slices. Existing root acquisition catalog reads retain 120000ms freshness, caller-owned cancellation and independent loading/error/retry/verified-empty states. Required origin/stage choices start blank; actual catalog names/IDs and inactive-origin/final-stage labels remain explicit without inferred permissions/transitions. Drafts and selected identity survive refresh; dispatch requires verified current catalog membership, never a missing ID silently converted to another choice.

Signal Forms trims name/email/phone/referenceAddress/observation and maps optional blanks to null; only those fields plus selected originId/stageId are writable. Source bounds are 120/120/30/200, required name and valid optional email; phone has no profile-pattern rule and observation has no documented maximum. The unchanged dialog lifecycle blocks duplicate/pending dismissal, preserves safe inline failures and fences owner/session/destruction/closing-animation completions. Same-session renewal preserves work; SSR starts none. Confirmed Result success alone closes/emits generic route-local feedback. Existing active inbox observations already revalidate once at effective paging; no duplicate reload, optimistic totals or write replay. Cancellation cannot undo dispatched writes.

M03/RF03/HU03 is context, not a new acquisition RF/HU. Editing, follow-ups, conversion, catalog administration and public quote/pricing/landing/SMTP remain undelivered. Pending acceptance: CRM → Prospectos → Crear prospecto → invalid/valid submit → generic toast and one inbox revalidation → retain effective navigation. Deterministic tests/build are technical evidence only; independent live/backend/CORS/authorization and Chrome/Edge/Firefox keyboard/responsive proof remain pending, as do full WP6 and independent WP4/WP5 acceptance.

### Bounded loaded-lead editing — fourth WP6 slice

Detail-only «Editar prospecto» opens the existing LeadEditor with a genuinely loaded Lead matching the current route ID, captured name/ID and all seven writable fields. The creation consumer from `5e1b0b2` stays unchanged. Full updateLead replacement trims text and sends nullable blanks as null under the same validation bounds; registration/actor/conversion metadata stays server-owned. Converted leads are not disabled by an invented ACL, and no customer identity/account is inferred. The PUT does move the stage under the same backend funnel rule as a follow-up: the dialog's «Motivo del cambio de etapa» field sends the optional `comentarioSeguimiento`, mandatory on a rollback and ignored by the creation POST, and a stage change records the same follow-up a manual registration would. The level rule is recorded in the sixth slice below.

Root finite catalog reads/TTL remain caller-owned. Drafts and loaded association IDs survive refresh, including inactive origins/final stages; absent IDs remain visibly unavailable without fabricated names or automatic substitutes. Dispatch rechecks verified current choices and blocks failed/in-flight catalogs. Pending blocks duplicates/dismissal, safe inline failures preserve drafts and retry is explicit. Only confirmed Result success emits a generic route-local update toast and closes if current. Existing active detail/inbox observers revalidate once after store invalidation; no manual reload, local patches, invented totals or write replay.

Synchronous ownerChanged$ cancels before new route data selection; captured owner revision/ID/session/overlay checks and unchanged dialog lifecycle fence route/session/destruction/closing-animation work. Same-session renewal preserves drafts/work; cancellation cannot roll back dispatched writes. This supersedes only editing-as-planned in the historical slices. M03/RF03/HU03 supplies context; dedicated acquisition RF/HU remains missing. Pending acceptance: CRM → Prospectos → loaded detail → Editar prospecto → invalid/valid save → generic toast and one revalidation → effective back link. Follow-ups/conversion/catalog administration, independent live/backend/CORS/authorization and Chrome/Edge/Firefox keyboard/responsive proof remain pending. Independent detail verifier/native prior inbox review were not executed; tests/build are not substitute approval or full WP6/WP4/WP5 acceptance.

### Bounded read-only lead follow-ups — fifth WP6 slice

T4/S1–S2 adds on-demand consultation only after editing boundary `f4634af`, not an accumulated branch review. Verified matching lead detail mounts LeadFollowUps only inside an opened native Seguimientos disclosure. Root observeFollowUps/selectFollowUps retain the unpaged list, 30000ms success TTL and shared ref-counted cancellation. Closing destroys this consumer; reopening checks freshness, explicit retry forces a read and same-owner stale rows remain with updating/error feedback. Profile/edit stay available when the section fails. Owner changes cancel synchronously before replacement selection; keyed views, session/DestroyRef and actual native open checks fence detached/queued events and retry. Renewal preserves work; SSR dispatches none.

Responsive records preserve server order, literal comments (null unregistered, empty unchanged), UTC dates and actual record/stage/user IDs. No catalog/actor/customer lookup, aggregate total/pagination or communications timeline; this reader moves no stage, which belongs only to the write paths in the fourth and sixth slices. M03/RF03/HU03 supplies context; dedicated acquisition RF/HU remains missing (RNF09/RNF10/RNF12). Registration T7 and conversion T5 remain pending. Pending acceptance: CRM → Prospectos → detail → open/close/reopen Seguimientos → retry failure → effective back link. Technical tests/build are not unavailable independent/native review, live backend/CORS/authorization or Chrome/Edge/Firefox keyboard/responsive proof; full WP6 and independent WP4/WP5 acceptance stay open.

### Bounded lead follow-up registration — sixth WP6 slice

T7/S1–S2 is a separate registration delta after read-only T4 `5386695`. The open verified lead's Seguimientos panel projects Registrar seguimiento into its CatalogFrame header. [LeadFollowUpEditor](../src/app/features/customers/presentation/components/lead-follow-up-editor/lead-follow-up-editor.ts) captures actual loaded name/ID without a new lead lookup. Only the finite root stage catalog is read (120000ms TTL): required blank initial choice, actual ordered names/IDs/final labels, independent pending/error/verified-empty/forced retry, retained drafts and unavailable selected IDs. Dispatch rechecks verified membership, without inferred final-stage ACL or a default from the lead profile. Unbounded comment is trimmed with blank becoming null. Only leadId/stageId/comment reach addFollowUp; actor/time stay server-owned. The POST moves the lead stage through `CaptacionService.cambiarEtapa` (backend `674a6b1`, `829f01f`), the single transition authority shared with the prospecto PUT, where `FunnelStage.order` is a LEVEL that several stages may share: advance is any stage of the smallest order strictly greater than the current one, a forward jump above it returns 400 with no writes, a strictly lower order is a rollback and needs a non-empty comment, a different stage at the SAME order moves the stage without a reason and the exact current stage only records the entry. Options are labelled by relation (current, next, rollback, same level, jump) with jumps disabled; the seeded catalog `Nuevo 1 · Contactado 2 · Cotizado 3 · Ganado 4 · Perdido 4` keeps both terminal outcomes at level 4 as alternatives.

Unchanged dialog lifecycle plus panel-local synchronous stop cancellation, owner/session/DestroyRef and actual native disclosure checks fence reads/writes and post-await feedback, including closing animation. Renewal preserves work; cancellation cannot undo dispatched writes. Pending blocks duplicate save and Cancel/Escape/outside dismissal. Safe inline errors preserve drafts for explicit retry. Only confirmed Result success emits generic route-local feedback; unchanged root invalidation refreshes observed follow-ups/profile/active inboxes once, without duplicate loads, optimistic appends/totals or POST replay. Failed revalidation retains verified same-owner rows with GET-only retry.

Pending, not delivered: an already-provisioned database keeps `Perdido` at level 5 because the Flyway `V1` seed was not renumbered, so it needs the one-line `UPDATE etapa_embudo SET orden = 4 WHERE nombre = 'Perdido';` run with the project's own credentials; the backend has no migration tool. `es_final` remains decorative — it only feeds the « · Final» label — and no rule was invented for it. Observed technical evidence: backend full suite 96/96 BUILD SUCCESS; frontend `tsc` app+spec clean, 221/221 tests across 7 spec files and prettier clean. Native review, live backend/CORS/authorization, browser/keyboard/responsive acceptance and full WP6 remain pending.

Pending acceptance: CRM → Prospectos → verified detail → open Seguimientos → Registrar seguimiento → invalid/valid stage/comment → confirmed generic toast and one revalidation → failed-read retry without another POST. M03/RF03/HU03 is context; dedicated acquisition RF/HU remains missing (RNF09/RNF10/RNF12). T5 conversion/catalog administration and independent/native/live backend/CORS/authorization/Chrome/Edge/Firefox keyboard/responsive proof remain pending; technical checks do not complete WP6 or independently accept WP4/WP5. This supersedes registration-as-planned in the historical consultation slice only.

### Bounded confirmed lead conversion — seventh WP6 slice

T5/S1–S2 is a separate source-connected candidate after follow-up registration `5780626`, not an accumulated branch review. Verified matching lead detail retains Edit in the CatalogFrame header and opens [LeadConversionDialog](../src/app/features/customers/presentation/components/lead-conversion-dialog/lead-conversion-dialog.ts) with captured name/ID. A blank required residential/commercial choice and explicit confirmation send only leadId/type through the existing validated contract. The backend copies current stored lead data; no copied contacts, direct customer creation, account/email merge, inferred stage change or local conversion flag mutation.

Already-converted records still dispatch explicit backend requests. Repeated conversion returns the linked customer and may retain a stored type different from the requested type; no promise of a new record or changed type. Confirmed validated Result success alone emits generic route-local feedback and a link to the actual returned customer ID, without lead paging query parameters, automatic navigation or customer lookups. Only an ephemeral owner/session-scoped link ID is retained, never a profile/read cache. Root observers own affected revalidation; read failures stay visible and retry GET only, without duplicate reloads, optimistic totals or POST replay.

Pending blocks duplicate confirmation and Cancel/Escape/outside dismissal. Safe inline failures retain selected type/target for explicit retry; an unknown network outcome is not proof of no effect. Unchanged dialog lifecycle plus synchronous ownerChanged$/revision/session/DestroyRef/current-overlay checks fence replacement/destruction/closing-animation feedback. Same-session renewal preserves work and SSR dispatches none; cancellation cannot roll back dispatched writes.

M03/RF03/HU03 remains context and dedicated acquisition RF/HU remains missing (RNF09/RNF10/RNF12). Pending acceptance: CRM → Prospectos → verified detail → Convertir a cliente → select type/confirm → inspect actual customer link → repeat/deny/fail while preserving context. Technical tests/build do not replace unavailable independent/native review or live backend/CORS/authorization/repeated-conversion and Chrome/Edge/Firefox keyboard/responsive proof. Full WP6 and independent WP4/WP5 acceptance stay pending. This supersedes conversion-as-planned only; catalog administration/public quote/pricing/SMTP remains outside scope. The optional portal account added by WP10 T17 (section below) supersedes only the “no account creation” part of this checkpoint; the rest of the conversion contract still holds.

### Dynamic backend role permissions — T4

M02/RF02/HU02/P03 connects Roles/RBAC through stateless catalog/query/save use cases, a root SignalStore and a distinct repository token aliased with useExisting to the root implementation injecting its HTTP source (RNF09/RNF10). `GET /api/permisos` supplies read-only permission metadata; `GET /api/roles/{id}/permisos` supplies the actual assignment. IDs, codes, descriptions and module groups come from the backend, not fixed CRUD unions, illustration rows, guessed role IDs or configured flags. The old illustration source/dialog are unwired test/demo assets, never HTTP fallbacks.

Responsive module fieldsets expose labeled Signal Forms checkboxes, description/code/ID and explicit loading, empty and retryable error states. Assigned permissions absent from the catalog remain visible and selected until explicitly removed; they are never silently dropped. Changing roles discards a draft only after successful loading of both catalog and assignment. Superseded loads are cancelled and response identities checked; failed loads preserve the visible role/draft and block saving. Revisiting the retained section checks the 30-second catalog/assignment TTL, preserving unsaved drafts during revalidation and failed refresh.

Save confirms the affected role and concrete grants/removals, then sends atomic whole replacement `PUT /api/roles/{id}/permisos` with required `{ idsPermisos: integer[] }`; IDs are nonnegative and unique, and `[]` means no permissions. The returned role ID and assigned set must match the request before reporting success. Pending submission blocks duplicates and dismissal; 403 preserves the draft for explicit correction/retry, without automatic mutation replay. The backend prohibits changing ADMINISTRADOR, editing one's own role and granting unauthorized permissions; the frontend neither infers ACL from names nor assumes every `delSistema` role is uneditable. Changes apply from the next request according to the contract. Backend authorization remains authoritative. No role-management UI, navigation ACL, authentication mutation or translation is introduced. Sessions/audit have T5–T6 HTTP adapters; legacy simulations are unwired. RNF06/RNF08/RNF12 guide accessible controls and feedback; live authenticated backend/CORS and Chrome/Edge/Firefox keyboard/responsive acceptance remain pending.

### Read-only backend audit viewer and CSV — T6

Audit-specific RF/HU traceability is still missing from the inherited product plan. M02/RF02/HU02/P03 provides users-administration context, not new audit requirements; RNF06/RNF08/RNF09/RNF10/RNF12 guides navigation, responsive feedback and layering. The connected Audit section has a root SignalStore, read/detail/export use cases and an audit repository token aliased with useExisting to the root implementation injecting the root source.

The HTTP source reads `GET /api/auditoria`, with actor ID, inclusive UTC from/to days, entity/action and zero-based page/size parameters. Actor filtering uses a labeled searchable Helm combobox with independent local query controls and readonly root UserStore selection, independent of the Users listing controls. Debounced name/email searches and option pagination query the existing users endpoint; typing or erasing search never applies audit identity, and raw ID entry is absent. Email distinguishes equal names; only a selected option supplies the stable numeric userId, independently of search text. All actors clears that selection; clearing applied filters also resets search. The retained section preserves the choice, including temporary catalog gaps. Option loading and failure remain explicit and retryable, with component cancellation; historical/deleted actors may be absent from current query results. Audit rows, totals, detail IDs and raw export remain server-authoritative, never constrained by catalog membership. The viewer requests five records; filtered total and `totalGlobal` come from the backend, not loaded rows. Returned codes remain open strings; detail reads the chosen ID and validates identity and supplied changes. Superseded queries are cancelled; stale results cannot replace current state or global totals. Invalid input/DTOs produce safe typed failures. Legacy in-memory audit fixtures remain unwired, never HTTP fallbacks.

The compact main toolbar contains only the responsible-actor combobox, More filters and Export CSV. More filters reveals inclusive UTC from/to dates, entity and action in two desktop columns or a mobile stack; toggling is local, never queries or clears field values. Its badge counts each applied secondary field independently, excluding actor, search and defaults. Applied actor/date-endpoint/entity/action chips remain visible outside the panel and remove only their own field; Clear all appears only with applied filters. Filter changes reset the query page. Export snapshots applied filters and blocks filter mutations while pending; the combobox trigger continues showing the applied actor, not popup search text. Keyboard highlighting exposes the active option to assistive technology while Brain retains navigation and selection behavior.

Desktop rows and mobile cards show backend actor, UTC timestamp, action, entity, record ID and IP/origin. Loading, empty, retryable query/export errors and pending controls remain explicit. `GET /api/auditoria/exportacion` returns raw CSV bytes for the filters, with a documented 10,000-record cap; export never rebuilds CSV from the cached page. The download adapter guards browser APIs for SSR, releases object URLs and reports initiation, not successful file saving. Actual response headers, spreadsheet-formula safety and browser download acceptance remain unverified.

This delivers read-only HTTP query/detail/export, not audit writes, a separate route, frontend durable persistence, security monitoring, immutability or actual hash/integrity verification. Navy primary actions and UTC deliberately remain instead of the screenshot's coral Save and UTC-5. Screenshot comparison and markup tests do not establish rendered fidelity; Chrome/Edge/Firefox visual, responsive, keyboard and actual download acceptance remain unrun.

## Domain foundations by backend area

The PDF/64-table SQL schema now has English-named domain coverage across all eleven backend areas. These are entities, explicit action/query parameters, typed errors and repository contracts, **not completed screens or integrations**. New repositories outside customers remain unwired. Existing auth/IAM behavior stays intact; customers now adds its documented HTTP sources, application actions and a source-connected P04 list with WP3 create/edit/deactivate actions; WP3 acceptance is user-reported; remaining customer screens and independent live/browser verification are pending.

| Backend area | Feature and coverage reference |
| --- | --- |
| A — Security and access | Existing auth and [users domain](../src/app/features/users/domain/README.md); no credential hashes in frontend entities. |
| B — Customers and acquisition | [customers](../src/app/features/customers/README.md) |
| C — Services and pricing | [service-catalog](../src/app/features/service-catalog/README.md) |
| D — Operations and scheduling | [operations](../src/app/features/operations/README.md) |
| E — Field personnel and execution | [field-operations](../src/app/features/field-operations/README.md) |
| F — Billing and collections | [billing](../src/app/features/billing/README.md) |
| G — Customer support | [customer-support](../src/app/features/customer-support/README.md) |
| H — Communications | [communications](../src/app/features/communications/README.md) |
| I — Web content | [web-content](../src/app/features/web-content/README.md) |
| J — Reports and configuration | [reports-settings](../src/app/features/reports-settings/README.md) |
| K — Accounting integration | [quickbooks](../src/app/features/quickbooks/README.md) |

Each reference maps its SQL tables to entities and distinguishes actual backend operation/response contracts from schema-derived **proposals**. SQL records and partial/redacted API projections are separate: missing response fields are never synthesized. Older SQL does not replace richer existing IAM contracts. Credentials, processor tokens and backend-only integration fields are excluded explicitly.

New domain representations use numeric INT IDs, precision-safe strings for BIGINT IDs and DECIMAL values, calendar/time strings for DATE/TIME and `Date` for DATETIME. Nullable columns remain explicit `null`; only actual CHECK constraints close a value set. Factories materialize typed values like User; they do not validate unknown transport payloads or authorize operations. Future adapters must establish lossless transport, validation, server-owned financial rules and sanitized/public-only data before wiring these contracts.

RNF09/RNF10/RNF12 guide the foundation. Existing M/RF/HU/P associations and missing dedicated traceability are recorded per area; no new functional requirements, navigation ACL, timezone configuration or delivered feature claims are inferred from tables or seed data. Backend-only QuickBooks responsibilities and all existing live/browser acceptance gaps remain unchanged.

## People and navigation

Planned actors are administrators, administrative staff, field staff and customers. A “boss” or otherwise authorized supervisory profile appears in the plan, but its relation to formal roles and permissions is unresolved; do not equate it with administrator.

Planned entry views are P02 for administrators, P06 for administrative staff, P09 for field staff and P11 for customers. These identifiers describe intended entry views, not an ACL or implemented redirects. P07 now has read-only staff directory/profile consumers under RRHH; this does not deliver HR writes or the P09 assigned-services experience. Actual permissions must be confirmed with the backend.

## WP7 T4 — Read-only staff consumers

RRHH connects the existing root HTTP/application/store boundary to the protected directory and explicit own/ID profile routes (M06/RF07/HU07/P07; RNF09/RNF10/RNF12). Name/document search (not email), active filtering and server paging preserve effective metadata; same-query stale feedback/retry, consumer cancellation and 120000 ms success-only freshness remain root-owned. Weekly slots retain business calendar/time text; empty availability means no weekly restriction, not free bookings. The auth guard is not a role ACL. Route-owned complete toast providers and root store lifetimes are preserved. Staff writes, request-edit consumers/cancellation, orders/assignment/calendar and full WP7 remain pending. The later T5 creation consumer now connects the active service-type read boundary.

Observed technical checks: 2089/2089 tests across 138 files and successful browser/SSR production build with one prerendered route, warning 646.28/500 kB. Independent guarded-route verification passed 30/30. These checks do not establish live backend/CORS, backend permissions/redaction or Chrome/Edge/Firefox keyboard/responsive acceptance. No business timezone or browser-derived today was selected.

## WP7 T5 — Bounded internal request reads

M04/RF04/HU04/P05 (RNF09/RNF10/RNF12) connects the root HTTP/repository/use-case/store read boundary to `/admin/operations/requests` and `/:id`, under a new approved **Operaciones** sidebar entry. The group defaults to requests; preserve IAM/CRM/RRHH, disabled Landing/Cotizaciones/Programaciones and the temporary users redirect. Existing authentication guard and complete route-owned toast scopes gate both lazy consumers without adding a role ACL or changing root lifetimes.

Inbox uses initial0/20, actual server order/effective paging, readonly root projections and one fenced out-of-range recovery, not catalog downloads/local slices or invented totals. Detail uses validated int32 IDs, independently validated numeric return context, plain text/null/calendar/UTC values and no actor/customer lookups. Existing30000ms success-only freshness, same-key stale feedback/retry, cancellation, session renewal/replacement and SSR safety remain root-owned. This read checkpoint introduced no filters/KPIs, write controls or premature order/agenda navigation; the later creation slice below adds its own bounded launcher.

Parent technical evidence: isolated inbox17/17 and detail15/15, then root/guard/sidebar/DI integration49/49 across four files using actual AuthStore/interceptor with synthetic HTTP. Independent guard verification passed 37/37 across three files without severe findings. Current-root full verification passed 2245/2245 tests across 145 files and browser/SSR production build with one prerendered route, warning 651.28/500 kB. Live backend/CORS, backend permissions/redaction and recent Chrome/Edge/Firefox keyboard/responsive acceptance remain pending. Creation/edit/cancellation, orders/manual assignment/calendar and full T5/WP7 are not complete. See [Operations implementation notes](../src/app/features/operations/README.md).

## WP7 T5 — Request creation, editing and cancellation boundary

M04/RF04/HU04/P05 (RNF09/RNF10/RNF12): Operaciones → Solicitudes → Crear solicitud now uses Signal Forms/Helm and existing root customer/property/service-type projections. Customers are server-paged; selected safe identity survives page gaps. Changing customer synchronously clears/cancels the old property context. No access instructions/door codes, inferred actor/ACL, browser-today policy or availability promise is added.

All three selections require verified unexpired membership at dispatch; stale/error/loading choices block saving. Explicit revalidation preserves drafts and permits a same-owner effective-page revisit without another property read. Send exactly customer/property/type/trimmed nullable description/calendar date; backend ownership/activity/date validation remains authoritative. Pending blocks duplicate save and Cancel/Escape/outside dismissal. Existing session/owner/destruction/navigation/closing-animation fences preserve renewal and prevent stale feedback. Confirmed success alone emits a generic route-local toast; existing observed invalidation refreshes once, with no optimistic rows/totals or POST replay/rollback promise.

The root service-catalog provider reuses existing HTTP/auth/useExisting composition. Update HTTP/application is separately committed as a72a6e4. The later verified editing consumer is described below; the later cancellation checkpoint also connects its caller-owned root action and explicit confirmation consumer. Corrected creation editor/inbox/core tests passed55/55 after four freshness RED failures; independent corrected verification passed55/55 across three files with no remaining candidate-caused findings. Current post-fix verification passed2363/2363 across149 files and browser/SSR production build with one prerendered route, warning655.94/500kB. Live backend/CORS/permissions/redaction/browser acceptance and full T5/WP7 remain pending.

Chrome156.0.8078.80 functional smoke passed at1440×1000 and390×844 using isolated browser contexts and synthetic HTTP only: public login, required choices, safe retry/draft retention, keyboard focus, pending dismissal guards, exact payload, viewport fit and one observed refresh. Mobile initially exposed an unreachable Save button; the local dialog now reuses CRM's `max-h-[90dvh] overflow-y-auto`, pinned by public DOM assertions. The final authorized run kept workspace files frozen. Earlier navigation/detachment failure has no demonstrated cause. This is not live backend/CORS/permission/redaction, exhaustive accessibility or Edge/Firefox acceptance; no E2E target/dependency was added.

### Loaded-request editing checkpoint

Operaciones → Solicitudes → detail → Editar solicitud captures a matching loaded registered request. The same Signal Forms editor preserves immutable customer context and replaces only property/service type/trimmed nullable description/calendar date. Unchanged captured references, including inactive or missing catalog IDs, remain legitimate; changed selections require fresh verified owner-property/active-catalog membership. Backend state/date/ownership rules remain authoritative, without browser-today or inferred ACL.

Root update coordination shares the write gate, rejects wrong-owner success and invalidates observed pages/detail/actual owner history once. Query-only history navigation preserves draft and pending PUT; owner/session/destruction/closing-animation fences cancel stale work and feedback. The detail-local dialog service/config chain preserves parent defaults and other dialogs' history behavior; destroyed views dispose synchronously without scheduling another exit render. Pending blocks duplicate saves and dismissal; safe failures retain drafts, and failed revalidation only retries GET.

Current independent Operations verification and parent spot-check each passed425/425 across17 files. Parent full verification passed2495/2495 across153 files plus production browser/SSR, one prerendered route, warning656.43/500kB. Frozen-workspace Chrome156 creation/editing checks passed1440×1000 and390×844 with synthetic HTTP. This is not native approval, independent full-suite/browser proof, live backend/CORS/authorization/redaction, exhaustive accessibility or Edge/Firefox acceptance. The later cancellation checkpoint below completes technical request consumers; orders/manual assignment/calendar, full WP7 and external acceptance remain pending.

### Explicit request cancellation checkpoint

M04/RF04/HU04/P05 (RNF09/RNF10/RNF12): a matching loaded registered request exposes Cancelar solicitud. The feature-local Helm/Signal Forms confirmation captures request/customer identity, warns that cancellation is irreversible and requires a trimmed reason of1–250 characters. Only ID/reason reach the existing cancellation contract; expected customer is context, never wire/auth-inferred data. Pending guards, same-ID query preservation and owner/session/destruction/overlay fences reuse existing helpers and local dialog policy. Safe errors preserve drafts; uncertain outcomes advise checking status, without automatic replay or rollback promises.

Only validated success invalidates pages/target detail/actual owner history; existing active observers refresh once, without optimistic rows/totals or duplicate reload. Current independent Operations run and parent spot-check passed455/455 across19 files; parent full2525/155+SSR passed(one prerender656.43/500kB warning). Chrome156 over synthetic HTTP passed creation/editing/cancellation1440×1000/390×844. The first independent cross-drive copy failed before tests; only the temporary copy's drive changed, with no app/dependency/config/timeout modification. Technical T5 is connected; full WP7 and live backend/CORS/permissions/redaction/EdgeFirefox/exhaustive accessibility acceptance remain pending. Native assessment is not approval.

## T6 first order-read boundary — source ready only

M05/RF05–RF06/HU05–HU06/P06 (RNF09/RNF10/RNF12): cold root order HTTP list/detail and stateless application actions now forward through the existing full-interface repository/useExisting composition. Unknown responses validate identity, nested DTOs, effective server pagination and bounded decimal/offset timestamp fields. Detail property ID/customer must match the order before operational access fields are returned; never put them in lists/logs or infer authorization from roles. Dates/times remain literal business-calendar values; that first source boundary added no timezone/browser-today, cache policy, store, route, UI or writes. Existing request behavior and other24 unsupported methods remain preserved.

Historical source-checkpoint evidence: focused105 tests and parent full2575/156+production SSR passed(one prerender661.99/500kB warning). Independent Operations verification passed505/505 across20 files in an isolated same-drive copy without blockers. Order consumers/creation/manual scheduling/team/agenda and full T6/WP7/live backend/CORS/authorization/redaction acceptance remain pending; no native approval or independent full-suite/SSR/browser is implied.

## T6 order-create boundary — source ready only

M05/RF05–RF06/HU05–HU06/P06 (RNF09/RNF10/RNF12): a stateless CreateServiceOrderUseCase and root repository now forward the cold captured three-field POST(idSolicitud/montoEstimado/observacion). Validate positive request ID, nullable bounded plain decimal input→JSON number and nullable literal observation(max2000); do not copy customer/property/actor/status/generated IDs or add preflight/optimism. Validate positive returned order/request linkage/PENDIENTE and reuse unchanged nested detail/property-owner guards. Backend atomically changes registered request to attended and creates the order; repeated subscriptions are separate non-idempotent writes, no retry/rollback guarantee. That creation transport boundary delivered no order store/form/route/consumer or freshness policy; read state is now implemented separately below.

Historical creation-checkpoint evidence: creation/read/composition GREEN123 followed meaningful RED47fail/76pass. Parent full2622/157+SSR passed(one prerender663.09/500kB warning); independent Operations verification passed552/552 across21 files without blockers. Order presentation, manual scheduling/team/agenda, full T6/WP7 and live/backend/CORS/authorization/redaction acceptance remain pending; no native approval or independent full-suite/SSR/browser claim.

## T6A order read state — no order screen yet

M05/RF05–RF06/HU05–HU06/P06 (RNF09/RNF10/RNF12): root `ServiceOrdersStore` now owns normalized full-query list and ID-detail resources through the existing named use cases/repository, preserving actual effective metadata. Human S5 approves30000ms success-only freshness checked on reads/revisits without polling; shared cancellable flights and forced retries retain verified same-key data, including empty/zero, on failure. Independent20-entry registries protect active/in-flight views; existing resource/session helpers fence expiry/replacement/destruction, preserve renewal and prevent SSR reads without auth/storage/lifetime changes. Presentation data is not authorization. Parent and independent Operations checks each passed629/629 across23 files; parent full+production SSR exited0 with one prerender and663.09/500kB warning, but its full-suite count is unavailable. No native approval or independent full/SSR/browser claim. This historical T6A checkpoint was read-only; current root creation/write invalidation is documented in T6C below. Order routes/pages/forms/manual scheduling/team/calendar, full T6/WP7 and live API/CORS/permissions/redaction/browser acceptance remain pending. See [Operations notes](../src/app/features/operations/README.md).

## T6C caller-owned order creation — state ready, no UI

M05/RF05–RF06/HU05–HU06/P06 (RNF09/RNF10/RNF12): root `ServiceOrdersStore.createOrder(params, expectedCustomerId)` captures only requestId/estimatedAmount/observation before cold execution through the lazily resolved existing CreateServiceOrderUseCase. Expected customer is legitimately loaded context, never sent or inferred from auth. Duplicate protection is per order store, not a global cross-store transaction. Safe Result failures/current-generation finalizers and caller cancellation/session replacement/expiry/destruction fences protect pending work; renewal preserves the same session. SSR/guest dispatch no mutation dependencies or writes; SSR initializes neither auth nor storage.

Only confirmed current-owner success expires all order queries/returned detail and request pages/linked detail through the used narrow `ServiceRequestsStore.invalidateAfterOrderCreation` seam. Active caller-owned observations share exactly one ref-counted GET per affected key; inactive entries expire without reads or orphan root subscriptions. Order store alone invalidates actual-owner history once; the request seam owns no history/write/revision/toast effect. Failed revalidation retains verified same-key data with visible error/GET-only retry, never replays POST or changes confirmed write success into failure. Existing 30-second read TTL, pinned20-entry bounds, helpers, HTTP/auth/domain and lifetimes remain unchanged.

Parent-reported evidence: compiled RED34fail/630pass → GREEN664/664 across25 files; full2734/2734 across161 and production SSR exit0 with one prerender, warning663.09/500kB. Independent verification passed664/25 without severe blockers. The final parent spot-check also passed664/25; these checks are not native approval or live acceptance. Historical T6A full-suite count remains unavailable, not reconstructed from this newer run. Backend creation irreversibly changes a registered request to attended and creates a PENDIENTE order, without frontend optimism/copied fields, automatic retry or rollback/idempotency guarantee. Order forms/launchers/pages/routes, scheduling/team/calendar, full T6/WP7 and live backend/CORS/permissions/redaction/browser acceptance remain pending. See [Operations coordination](../src/app/features/operations/README.md#t6c-caller-owned-order-creation-coordination).

## T6H scheduling and active reasons — source/application only

M05/RF05–RF06/HU05–HU06/P06 (RNF09/RNF10/RNF12): existing root repository/useExisting composition now forwards `scheduleOrder` and `getActiveReschedulingReasons` through named stateless use cases. Cold PUT `/api/ordenes/{id}/programacion` captures only date/startTime/endTime/reasonId safely at call time and sends fecha/horaInicio/horaFin/idMotivo after positive-int32/real-calendar/clock validation. Flat OrdenResponse becomes a requested-target-validated ServiceOrderSummary, not detail/property/history or an input echo. Backend owns minute truncation/default end/conditional active reason/conflicts/weekly availability/permissions/state/history; no frontend ACL/timezone/today/arithmetic. Cold active-reason GET preserves validated unique IDs, actual names, nullable/empty descriptions and server order, without invented isActive/SQL fields or catalog administration. Safe Result/errors, caller cancellation, transfer-cache/SSR/configuration guards remain; no retry/cache/optimism/rollback/idempotency promise or HTTP/auth/domain/provider/store lifetime change. [Implementation and source/test links](../src/app/features/operations/README.md#t6h-scheduling-and-active-reasons--httpapplication-only).

At this historical H checkpoint,21 methods remained unsupported, including other order writes, team replacement, agenda and proposed administration. Current WIP team HTTP/application wiring reduces that repository inventory to20, still including `getAgenda`. Parent-reported compiled RED88fail/718pass → unchanged-test GREEN806/806 across29 files; full2876/2876 across165 plus production SSR exit0/one prerender (664.88/500kB warning). These are parent technical checks, not independent UI proof/native approval. The historical H scope excluded eight implemented list/detail leaf files, now preserved as unverified private development checkpoints; independent Risk2/4 runtime evidence remains unavailable; no order routes/integration/creation UI/browser acceptance is established. S7 retired runner remediation unresolved, not fixed. Scheduling mutation state/cache/form/routes, team mutation state/UI and calendar consumers remain future independent tasks. Full T6/WP7/live backend/CORS/permissions/redaction/browser-matrix acceptance stays pending; backend endpoint support is not a working order screen.

Current S8 work is implementation, not accepted delivery: order leaves have53 parent-tested UI cases without routes or independent Risk2/4 proof; seven team HTTP/application files are wired, but independent Risk1 verification is PARTIAL after300s without exit/counts. Agenda transport/validator/spec/helper and only nullable AgendaEntry.serviceTypeName are implemented standalone, without repository/application/root wiring, store/calendar consumer/TTL/default date/timezone. Parent reports Operations974/31, full3042/3044 failing two Auth guards, unchanged focused Auth14/14 and separate SSR exit0/one prerender665.88/500kB warning; no cause is proven and the full failure persists. S8 continues T6F/T7B code work without more Auth diagnosis; recorded private WIP checkpoints preserve the code and mean neither completion, delivery nor native approval. No order creation form or scheduling/team UI exists; full WP7 and independent/live API/CORS/permission/redaction/browser acceptance remain pending. [Current inventory and checkpoint-specific evidence](../src/app/features/operations/README.md#current-wp7-development-work--not-accepted-delivery).

## Planned modules and useful identifiers

RF denotes functional requirements, RNF non-functional requirements, HU user stories, M modules and P screens from the functional source, `Avance_1.pdf`. These identifiers express intent, not Angular modules or delivery progress. The inherited text says eleven modules but enumerates M01–M12; preserve the twelve listed IDs. Modules, requirements and screens do not map one-to-one.

- **M01 — Authentication:** RF01/HU01, P01 HTTP auth with a temporary localStorage access/refresh candidate; independent closure, live browser verification and role authorization remain pending.
- **M02 — Users, roles and permissions:** RF02/HU02, P03 administration; no definitive permission matrix yet.
- **M03 — Customers and history:** RF03/HU03 for customer management and RF12/HU12 for history, both associated with P04.
- **M04 — Service requests:** RF04/HU04, P05 internal requests. The customer portal also spans M04/M05 through RF15/HU15 and P11.
- **M05 — Service orders and assigned services:** RF05–RF06/HU05–HU06, P06 orders; RF10/HU10, P09 field staff's assigned services.
- **M06 — Field staff:** RF07/HU07, P07 staff management intent. WP7 T4 connects read-only directory/profile consumers; profile/status/account/weekly-availability writes remain UNSUPPORTED.
- **M07 — Assignments:** RF08/HU08, P08, shared with scheduling.
- **M08 — Scheduling:** RF09/HU09, also P08; dates and operational timezone require a confirmed contract.
- **M09 — Customer support:** RF11/HU11, P10 for customer/administrative interaction, separate from service requests.
- **M10 — Reports:** RF13/HU13, P12 for administrative oversight.
- **M11 — Dashboard:** RF14/HU14, P02 for administrators/authorized supervision, not the current `/admin` shell and temporary users redirect.
- **M12 — QuickBooks integration:** RF16–RF17/HU16–HU17, P13. Planned synchronization includes customers, invoices and payment states, exclusively through the internal backend.

Cross-cutting intent includes RNF01 access/roles, RNF03 production HTTPS, RNF04 performance, RNF06 clear navigation, RNF07 browser compatibility, RNF08 responsive layouts, RNF09 extensibility, RNF10 layer separation, RNF12 validation/messages and RNF13–RNF14 backend-only QuickBooks integration. These are objectives and constraints, not proof of measured compliance.

## Planned journeys

### Internal operations

1. Find or register a customer, retaining useful context and history (M03/P04).
2. Record a service request (M04/P05) and progress to a service order (M05/P06).
3. Schedule the order and assign field staff (M07/M08/P08).
4. Follow execution through completion and payment status; use reports/dashboard for oversight.

This is a navigation outline, not a specification of automatic conversions, payment collection or unconfirmed backend rules.

### Field staff

Open assigned services (P09), inspect the client, date/time and current state, then perform a permitted state update. Mobile layouts should prioritize readable cards and visible actions rather than copying administrative tables.

### Customer portal

Open “My requests and services” (P11), inspect details and follow progress, then access customer support (P10) when needed. Direct creation of a *service request* by a customer is unresolved and must not be assumed from the portal's name. Registering an own *support attention* is implemented (WP10 T6, below) and is the only write the portal offers.

### Supervision and integrations

Use P02/P12 for indicators and reports within confirmed permissions. P13 may surface QuickBooks synchronization status, errors and permitted retries; integration logic and reconciliation remain backend responsibilities.

## Business states

Keep the existing Spanish state labels until contracts and localization are confirmed.

- **Normal order sequence:** `Pendiente → Programada → En proceso → Completada → Pagado` (pending, scheduled, in progress, completed, paid).
- **Cancellation:** an alternative exit for orders; allowed source states and other exceptional transitions/reopenings remain undefined.
- **Customer support sequence:** `Recibida → En revisión → Resuelta → Cerrada` (received, under review, resolved, closed).

Support states are independent of order states. Do not invent request states or treat a support case as a service request.

## Open questions — do not decide implicitly

- Public landing scope and its missing RF/HU traceability.
- Whether customers can directly create service requests.
- Formal meaning of “boss,” final ACL and permission-based entry/navigation.
- Exceptional order transitions, cancellations and duplicate-handling rules.
- Actual OpenAPI contracts: DTOs, errors/correlation, pagination/sorting/filtering, dates/timezone, uploads/evidence, idempotency and QuickBooks synchronization semantics. Proposed endpoints in the functional source are not authorized contracts.
- Permanent credential persistence/cookie transport; temporary localStorage access/refresh persistence is explicitly approved, with fail-closed SSR. Auth refresh/revocation adapters do not certify live backend acceptance. Review private-route render modes when fuller backend sessions are introduced.
- Generated versus manual API client, caching and retry policy, frontend observability and data policy.
- Spanish/English localization and fallback, operational timezone/formatting, browser/performance acceptance measurements, E2E tooling and production hosting.

Resolve these with explicit product/technical decisions and actual backend evidence. Update this guide when a route, consumer or integration changes delivery status; keep the useful identifiers without expanding this into a duplicate implementation matrix.

## Readable choices and reachable lead actions

RNF06/RNF08/RNF12: lead create/edit is viewport-bounded, with a scrolling body and non-scrolling header/actions. Selects show names and useful status/context rather than appended IDs across acquisition, preference properties, request choices, order reasons/staff and audit actors. Missing references remain explicit; numeric selection values, validation, write payloads and backend authority are unchanged. This is a presentation correction, not full WP1–WP7 acceptance.

## Current WP7 consumer integration (S10)

This checkpoint supersedes earlier pending-consumer statements for T6F/T6G/T6K/T7B/T7C only; historical evidence remains historical. Protected requests, orders and agenda are connected under `/admin/operations`, preserving the requests default, sidebar labels, existing guard and complete route-owned toast scopes. The repository now retains 19 unsupported methods; agenda forwarding does not add a cache or TTL.

- Verified registered request detail opens order creation with captured IDs, nullable bounded decimal/observation, guarded pending state and an explicit link to the actual returned order. No automatic navigation, duplicate reload or write retry.
- Loaded order detail opens scheduling and destructive full-team replacement, including explicitly confirmed empty removal. Existing root write coordination serializes create/schedule/team and validates target/owner before confirmed order/detail/history invalidation. Caller-owned reason and paged staff choices, unchanged dialog lifecycle and owner/session/closing fences remain. Backend state/conflict/permission rules remain authoritative.
- Agenda has a page-owned finite SignalStore and day/week/month date cells with real order links. It opens on the browser's current Monday→Sunday week: the reference date defaults to the browser's own civil day, `Semana` covers that week, `Día`/`Mes` derive from the same date and a blank reference date dispatches nothing. No operational timezone, polling, cross-visit cache/TTL, inferred staff identity, availability promise, drag or recurrence writes, and no calendar prev/next or today action: the reference-date control is the only way to move the window.

Observed parent checks: Operations **1192/1192 across 37 files passed**; full suite **3260 passed / 2 failed (3262 across 173)**, in the same Auth guard cases previously recorded. No cause or correction is inferred and Auth was not changed. Production/SSR **exit 0**, one prerender, initial bundle **668.47/500 kB warning**. Independent verification and browser/live API/CORS/authorization/redaction acceptance remain pending. Implementation is present, not full WP7 acceptance or native approval.

### S12 local integration and deferred validation

The user authorized local commits and merge into main, without push. A temporary Auth diagnostic candidate passed 3262/3262, but did not prove the original cause; it is archived under ignored tmp, and the Auth spec is restored exactly, with no Auth production changes. Therefore the retained-delivery evidence remains Operations1192/1192 and SSRexit0, with the earlier full-suite3260/3262 Auth failures explicitly deferred. Independent source review found no severe defect; its old runtime run timed out. The new browser probe remained an unexecuted draft and is not acceptance evidence. Local integration is not full WP7/live/backend/browser approval.

## CRM customer email reservation

M03/RF03/HU03: the approved rule reserves each nonblank customer email even while inactive.
Customer create/update and first lead conversion enforce normalized uniqueness in the backend and
database; conflict preserves the draft and does not merge clients. Repeating completed conversion
still returns the existing linked customer. Lead create/edit remains permitted with duplicate
warnings on the email field, using a permission-guarded boolean lookup rather than a catalog download.
Missing emails remain optional. See the [customer implementation boundary](../src/app/features/customers/README.md#reserved-customer-emails-and-lead-duplicate-warnings).

## WP8 — Customer support

M09/RF11/HU11/P10, with RF12/HU12 history context (RNF01, RNF08–RNF10, RNF12). Support requests are not
service requests: the module is `Atencion`, exposed at `/api/atenciones` by the backend, and the frontend
consumes it as its own capability, not as an order or request editor.

Connected under `/admin/support` (inbox) and `/admin/support/:id` (detail), both guarded and lazy inside the
protected admin shell, with the `Soporte` entry in the General group after `Operaciones`. The staff audience is
connected; the customer-own audience (`ATENCION_LEER_PROPIA` / `ATENCION_CREAR_PROPIA`) belongs to the portal:
the read side of it is connected by the WP10 T5 section below, and creating an own attention is
T6, still unimplemented.

- **Reads**: server-paged inbox with `estado`, `idTipo`, `idCliente` and business-local `desde`/`hasta`
  filters, effective returned metadata and one bounded out-of-range recovery; detail with the server-ordered
  follow-up timeline. By explicit human decision the inbox filters and paging live in the URL, so returning
  from a detail restores the filtered page, and a `403` on the detail stops rendering the loaded record at
  once instead of leaving it on screen. 30000 ms success-only freshness in one root store; a failed revalidation keeps verified
  data and only zeroes its freshness.
- **States**: the backend's fixed `RECIBIDA`/`EN_REVISION`/`RESUELTA`/`CERRADA` vocabulary with its supplied
  display name. There is no status catalogue endpoint and no frontend transition engine: the state dialog
  offers the documented targets minus the current one and the server's answer — including a 400 — is
  authoritative.
- **Writes**: create, add message and change state go through one root store gate, so a duplicate submit is
  refused instead of dispatched. Only a confirmed current-generation success invalidates the page variants and
  the affected detail; observed keys re-read once, inactive entries only expire, a failed write invalidates
  nothing, and a creation does not seed the detail cache because that entry means a verified GET a consumer
  actually read.
- **Redaction**: a follow-up with a null author renders an explicit "not shown" case. No name, user id or
  fallback from another field is invented, and the frontend does not certify backend redaction.
- **Paging safety**: a page size above the backend maximum is refused before dispatch, and a returned
  effective size different from the requested one is an invalid response — otherwise the server would silently
  answer a different offset than the one asked for.
- **Surveys, attachments/photos, message templates and catalogue administration** have no endpoint and stay
  unimplemented.

Acceptance gap, recorded rather than implied: live backend/CORS, cross-customer permission and redaction
outcomes, real 201/409 payload differences, browser acceptance in Chrome/Edge/Firefox and exhaustive
accessibility remain unverified. The native review of the inbox, detail and write slices could not be prepared
by the provider in this environment (reproducible `ETIMEDOUT` on the accumulated candidate); the earlier
transport and store slices do have their review closed, including one corrected CRITICAL finding about paging.
See the [support implementation boundary](../src/app/features/customer-support/README.md).

## WP9 — Dashboard P02

M10/RF13/HU13/P12 and M11/RF14/HU14/P02 (RNF01, RNF04, RNF07–RNF10, RNF12). `/admin` now opens the dashboard
and no longer redirects to users, which was the temporary placeholder since the shell was built.

- **Contract**: `GET /api/dashboard?desde&hasta`, authority `DASHBOARD_LEER`, window defaulting to the last 30
  days. The response carries the current situation (orders by state, services today and over the next 7 days per
  day and per collaborator, unscheduled orders, requests pending, open support) and the period activity
  (requests, orders created/completed/cancelled, compliance rate, completed amount, complaints).
- **No client arithmetic**: counts, amounts and the rate are printed exactly as supplied; `tasaCumplimiento` is
  null when there were no closures and renders as absent rather than zero.
- **No cross-visit cache**: entering reads once and only an explicit refresh re-reads. Because no settled read is
  replayed, a new subscription is a new read, so the page owns exactly one subscription per entry and per
  accepted window.
- **A window owns its numbers**: a different window clears the board and shows loading, and the displayed period
  is the one the server returned, never the one typed.
- **403 is an error, not an empty board**: a missing `DASHBOARD_LEER` is shown as an explicit permission error,
  because an empty board and a denied board look identical to a reader.

The `/admin/reports` page connects the report catalogue, paged history, explicit generation and CSV download.
Generation and CSV requests have server-side effects despite using GET; they require an explicit action and are never
automatically replayed. See the [reports implementation](../src/app/features/reports-settings/).

The user reports acceptance and security checks. Prior live checks observed JSON numbers and a percentage rate;
independent verification is not exhaustive. On 2026-11-22, 101 focused tests passed, the production build succeeded
with budget warnings, and unauthenticated dashboard and report reads returned 401. Independent frontend review did
not verify backend permissions or CSV content. The `Landing`
sidebar entry stays a disabled non-navigating button; the dashboard is reached through its own `Inicio` entry in the
General group, which is active only on the bare `/admin` route.

The dashboard uses separate Helm cards over the shared page background. A compact *Situación actual* strip sits
above a responsive grid of period metrics and charts. The date fields stay in *Actividad del período*, even while
changing the range reloads the data. The dashboard displays the range returned by the server and preserves
chart labels and values without adding a chart dependency. See the
[dashboard boundary](../src/app/features/dashboard/README.md).

## WP10 T14 — Customer portal account in the customer form

M03/RF03/HU03 with S9/S12/S13/S15. The customer create/edit dialog now decides whether the person
gets a portal account, rather than linking an existing user from a second module. The backend
contract is live: `POST /api/clientes` and `PUT /api/clientes/{id}` accept the optional `crearCuenta`
tri-state plus `password`, and every customer response carries `usuarioActivo`.

- **Tri-state kept intact**: absent `crearCuenta` never touches the account, `true` creates it or
  reactivates a deactivated row (both need `password` and a customer email), `false` retires an
  existing active account and sends no password. The wire body omits the key instead of guessing
  `false`, so ordinary profile edits cannot destroy an account.
- **Owned by the form**: a «Crear cuenta del portal» checkbox, off by default, reveals a required
  initial password and makes the email required; the dialog prints the captured state as `sin
  cuenta`, `activa` or `desactivada`; a deactivated account is recreated with a new password, and
  unchecking an **active** account asks for explicit confirmation because the access is cut
  immediately. Withdrawing that confirmation restores the checked state.
- **Field-level feedback**: `errores.correoParaCuenta`, `errores.passwordParaCuenta` and
  `errores.passwordSoloConCuenta` become their own typed errors, and with `errores.correo =
  EMAIL_RESERVED` they render next to the email or password input instead of the general alert.
- **Unchanged**: the same dialog lifecycle, pending guards (duplicate submit, Cancel/Escape/outside
  dismissal), safe inline failures that keep the draft, one generic toast and close only on
  confirmed success, and the existing post-write invalidation without an extra reload.

The opt-in that used to deliver only `409` conflict bodies now also delivers a documented **`400`**
validation body for the requests that ask for it: `POST/PUT /api/clientes` already opt in, so the
conditional account markers reach the adapter and render on their own inputs. The passthrough stays
narrow and unchanged elsewhere — `401` (with its credential invalidation and refresh-once path),
`403`, `5xx`, network failures and every request without the opt-in keep the generic mapping, and no
response is ever replayed. Token names were kept (`PRESERVE_API_CONFLICT` / `apiConflictContext()`)
because renaming would also require the token's own README, which stays out of this change; its JSDoc
now states the exact rule.

Pending acceptance: manual/live runs (create with and without an account, first account for an
existing customer, recreated deactivated account, retired active account after confirming), the
real backend 400/409 payloads and CORS, the actual password policy, `debeCambiarPassword` in the
portal (T16), the users-module counterpart (T15, connected in the section below) and
Chrome/Edge/Firefox keyboard/responsive checks. See the
[customer account boundary](../src/app/features/customers/README.md#connected-customer-portal-account-request-wp10-t14).

## WP10 T15 — CLIENTE account creation from the users form

M02/RF02/HU02/P03 with S9/S13/S17 (and S11 for the shared email). The users alta now reflects the
live backend contract: `POST /api/usuarios` with the CLIENTE role creates the customer row in the
same transaction, so a single form can decide both, and the user no longer has to visit two
modules. See the [users boundary](../src/app/features/users/README.md#wp10-t15--cliente-account-creation-from-the-users-editor).

- **Identity, not ACL**: the backend matches its CLIENTE role by exact name
  (`CuentaClienteService.ROL_CLIENTE`), so the form compares the selected catalog role against that
  name. No permission, navigation or CRUD column is inferred from it.
- **Create only**: the notice, the required `tipo` (`residencial`/`comercial`) and the optional
  `telefono` appear only in a new alta with CLIENTE selected. `PUT /api/usuarios/{id}` has no such
  fields and never creates a customer, so the edit dialog keeps its previous form and payload; moving
  an existing account to CLIENTE is not presented as customer creation.
- **Explicit, non-dismissible warning** that a new customer will be created with the same name, email
  and phone, that it is administered in CRM, that the account must change its password on first
  login and that the alta also needs the customer-creation permission. Changing the role away from
  CLIENTE empties both fields and their validation state before anything is dispatched.
- **Exact payload per role**: other roles keep `nombre`, `correo`, `password`, `idRol`, `idioma`,
  `activo`; CLIENTE adds `tipo` and, when supplied, `telefono`. The phone is trimmed and omitted when
  blank, and `tipo`/`telefono` never travel without asking for the customer row. Password bytes are
  never trimmed.
- **Failures**: a `403` on a CLIENTE alta states that creating the customer needs `CLIENTE_CREAR`
  and that nothing was created, instead of the generic permission copy and never raw backend text.
  The documented `409`/`EMAIL_RESERVED` binds to the email input with the shared-address explanation
  because the email is unique across accounts and customers, including inactive ones.
- **Success**: only a confirmed result emits feedback and closes; the toast names the created
  customer as `Usuario y cliente creados · Cliente #<idCliente>` (or without the reference when the
  response omits it). `idCliente` is parsed as a nullable positive int32 into `User.customerId`; the
  reference is plain text with no new route or navigation. `debeCambiarPassword` is not consumed yet
  because the forced first-login change belongs to T16.
- **Unchanged**: the same dialog lifecycle, pending duplicate-submit and Cancel/Escape/outside
  guards, drafts preserved on failure, owner/session/destruction fencing and the existing `UserStore`
  invalidation without an extra reload, optimistic row or write replay.

Pending acceptance: manual/live creation of a CLIENTE account (with and without `CLIENTE_CREAR`, with
and without phone), the real `409` payload and CORS, the created customer appearing in CRM, the
first-login forced password change (T16), the inactive/role-catalog edge cases and
Chrome/Edge/Firefox keyboard/responsive checks. Deterministic unit tests are not live evidence.

## WP10 T16 — Forced password change on first sign-in

M01/RF01/HU01/P01 with S10. An administrator (or whoever creates the account) may define a
provisional password; the backend persists `debeCambiarPassword`, returns it in
`POST /api/auth/login` and `GET /api/auth/me`, and `PUT /api/auth/me/password` clears it, closes the
other sessions and keeps the current one. The frontend turns that flag into a required step instead
of a suggestion. See the [auth boundary](../src/app/features/auth/README.md#forced-password-change-on-first-sign-in-wp10-t16--s10).

- **The flag is carried, not inferred**: it is validated with the rest of the profile and lives in
  `AuthSession.mustChangePassword`. A response that omits it (or sends `null`) fails closed as
  `true`, because it cannot prove the provisional password was already replaced; only an explicit
  `false` lets the session through, and a non-boolean value is an invalid profile.
- **One redirect matrix**: `authGuard` sends a provisional session to
  `/change-password?returnUrl=<requested URL>`, `guestGuard` sends it there from `/login`,
  `passwordChangeGuard` keeps it on the screen and moves a settled session to the captured
  destination, and an anonymous visit to the screen goes to
  `/login?returnUrl=<captured destination>`. The login page takes the same decision after
  authentication, so the original destination survives the forced step. A destination can only be an
  internal URL and never `/login` or `/change-password`, so it cannot loop.
- **The screen** is Helm/Signal Forms: current password, new password and confirmation, the
  documented policy (8–64 characters with uppercase, lowercase and digit) and the "must differ from
  the current one" rule checked before dispatch, labelled fields with help and inline errors, a
  pending state that blocks duplicate submits, drafts preserved on failure, and a `Cerrar sesión`
  escape hatch. There is no way to skip the change while keeping the session.
- **No optimism**: `PUT /api/auth/me/password` is followed by one forced `GET /api/auth/me`, and the
  destination is only reached when that profile already reports the flag cleared. If the read fails
  the outcome is reported as unconfirmed with a GET-only retry; the password write is never replayed.
  A rejected change keeps the session, the flag and the draft. Raw backend text is never shown.
- **Unchanged**: login, refresh, logout, the interceptor, both guards' session semantics, credential
  storage and its keys. SSR reads no storage and dispatches no auth request.

Pending acceptance: a live backend/CORS run of the full first-login round trip (provisional password
→ forced screen → cleared flag → destination), the "other sessions closed" side effect, the real
`400` payloads from the policy and the current-password check, and Chrome/Edge/Firefox
keyboard/responsive checks. Deterministic unit tests are technical evidence, not native/live
approval.

## WP10 T17 — Converting a prospect with an optional portal account

M03/RF03/HU03 with S12/S13. The conversion dialog now decides whether the new customer gets a
portal account, in the same form that converts the prospect, instead of a second trip to the users
module. The live contract is `POST /api/prospectos/{id}/conversion` with
`{ tipo, crearCuenta?, password? }` returning the created/converted `ClienteResponse`. See the
[customers conversion boundary](../src/app/features/customers/README.md#conversion-with-an-optional-portal-account-wp10-t17).

- **Same tri-state, explicit choice**: absent `crearCuenta` leaves the account untouched, so an
  untouched conversion still creates no account; ticking «Crear cuenta del portal para este
  cliente» sends `crearCuenta: true` plus the initial `password`; `crearCuenta: false` means no
  account. The dialog only ever emits absent or `true` — unticking the box removes the key again —
  and a requested account without a password or a password without the request is refused before
  any HTTP.
- **The email is copied, not typed**: the account needs a customer email, and the backend copies it
  from the prospect, so the dialog shows that provenance instead of asking for it again; the
  documented `errores.correoParaCuenta` then explains that the prospect has no usable address.
- **Markers decoded, not widened**: conversion already opted into the interceptor's documented
  `400`/`409` passthrough and now reuses the existing allow-list decoder, so
  `errores.correoParaCuenta`, `errores.passwordParaCuenta` and `errores.passwordSoloConCuenta`
  become `ACCOUNT_EMAIL_REQUIRED`, `ACCOUNT_PASSWORD_REQUIRED` and
  `ACCOUNT_PASSWORD_WITHOUT_ACCOUNT`, and `errores.correo = EMAIL_RESERVED` stays `EMAIL_RESERVED`.
  Nothing else is admitted: an undocumented marker keeps the generic `INVALID_INPUT`.
- **Field-level failure, actionable denial**: the account markers render next to the account choice
  (email reasons) or next to the password input, never in the general alert, and `EMAIL_RESERVED`
  states that the prospect's address is already used. A `403` is authoritative and reads as the
  missing permissions (conversion requires both customer create and update), never as server copy.
- **Confirmation**: only a validated Result success confirms, links the actual returned customer ID
  and closes; when an account was requested the message also states that the account was created for
  that customer. Pending blocks duplicate confirmations and Cancel/Escape/outside dismissal, a
  failure keeps the dialog, the choice and the password for an explicit retry, and a successful
  conversion is never repeated automatically.
- **No navigation added**: no new route, no automatic redirect and no `libs/ui`, theme or budget
  change; the existing dialog lifecycle, root invalidation and session/SSR fencing are unchanged.

Payloads actually sent: unticked → `{ tipo }`; ticked → `{ tipo, crearCuenta: true, password }`.
Password bytes are never trimmed, logged or echoed.

Pending acceptance: live backend/CORS conversion with and without an account, the real `400`/`409`
payloads, a converted prospect whose email is already taken, a `403` from an account without the
create/update permissions, and Chrome/Edge/Firefox keyboard/responsive checks. The deterministic
unit coverage (payloads, required password, the three markers, `EMAIL_RESERVED`, `403` copy, pending
and retry behavior) is technical evidence, not native or live approval.

## WP10 T2 — Portal shell, audience routing and own requests

M01/RF01/HU01/P01 with S4 and S7, plus the read side of M04/RF04/HU04/P05 and the customer entry
view P11 (RNF08/RNF09/RNF10/RNF12). The customer experience now exists as its own lazy route group
at `/portal`, composed exactly like `/admin`: one guarded shell with `router-outlet`, its own
navigation and its own children. It is not part of the admin shell and does not reuse its sidebar.

- **Route**: `src/app/experiences/portal/portal.routes.ts` declares the guarded `portal` group;
  `/portal` opens `/portal/requests`, the first implemented section. Later sections (own order detail,
  own support) add their route and navigation entry in the slice that connects their consumer, so no
  dead destination exists. (The T4 section below adds `services` as the second real section; the shell
  structure, the audience rule and the list behavior described here are unchanged.) The shell owns
  brand, session identity, `Salir` and the real section links; it has no sidebar, no KPIs, no
  environment/security banner and no administrative action.
- **Audience, not permissions**: the audience comes from the role label the backend returned in the
  profile (`AuthSession.role`). Exactly one role name is the customer audience — the backend's own
  `CLIENTE` (`CuentaClienteService.ROL_CLIENTE`, the same identity the users form uses) — and every
  other role, including an unusual or absent one, belongs to `/admin`. No permission, role ID or
  inferred user type is consulted, and neither role name grants or denies an API call.
- **One symmetric guard**: `authGuard` and `portalGuard` are the same decision. Authentication comes
  first (anonymous visits keep their captured `returnUrl`), then the forced first-sign-in password
  change of T16, and only then the audience rule. A customer opening any `/admin` URL is sent to
  `/portal`; a staff session opening any `/portal` URL is sent to `/admin`. Both targets are the home
  of the other audience, so re-evaluating the decision on the destination allows it and the two
  guards cannot bounce a session forever.
- **Honest destinations**: after login, the captured `returnUrl` is kept only when the session's role
  may open it; otherwise the person goes to their own experience. `guestGuard` sends an authenticated
  visit to its own home, and a settled session leaving the change screen goes through the same
  audience-aware destination. A pending password change still takes precedence over the audience
  redirect, so the forced step is never skipped by a cross-experience bounce.
- **Mi solicitudes**: `/portal/requests` reads the existing root `ServiceRequestsStore`. Its entry
  paging comes from the URL (`page`/`size`, added by T3 below) and defaults to offset 0 / limit 20, and
  it shows exactly what the server returned: the backend
  already scopes `GET /api/solicitudes` to the caller, so no customer ID travels, no row is filtered
  or sliced locally and no total is invented. The returned effective `offset`/`limit` are adopted for
  paging, with one fenced out-of-range recovery per user action. The documented 30000 ms success-only
  freshness, shared ref-counted reads, same-key stale data on failure and session/SSR fencing stay
  root-owned; the page owns only its query, its state feedback and its cancellation.
- **States and accessibility**: loading, `Actualizando solicitudes…` while a verified page
  revalidates, verified empty (`Aún no tienes solicitudes`), a distinct out-of-range empty state and a
  retryable error that keeps the last verified rows and offers GET-only retry. Records are a real
  table above 64rem of available container width and cards below it, both labelled
  `Mis solicitudes de servicio`; the status is a badge whose text carries the value, so colour is
  never the only signal; supplied UTC instants are printed literally. Copy is Spanish. Rows stay plain
  data apart from their own read-only detail link (T3 below): no create/edit/cancel action, no filter,
  KPI or total.
- **Tests first**: the redirect matrix (customer, staff, anonymous, pending password change), the
  guard matrix, the loop-freedom property, the login destination per role, the lazy composition and
  the list's loading/empty/error/stale states, effective-metadata adoption and bounded recovery were
  written before the implementation. The RED run failed to compile against the missing
  `audience-navigation`, `portalGuard`, `PORTAL_ROUTES` and `PortalRequestsPage`; afterwards the
  focused portal files pass 11/11 and auth + portal + app composition pass 275/275 across 23 files.
  `npx tsc -p tsconfig.app.json --noEmit` exits 0 and Prettier reports the touched files clean.
- **One pin awaiting authorization**: `src/app/app.routes.spec.ts` enumerates the app-level lazy
  groups (`["", ""]`, auth then admin) and now sees the third portal group, so the full suite reports
  3894/3895 with that single failure. That spec file was not part of this task's edit surface, so it
  was not modified; the assertion needs the authorized one-line update to `["", "", ""]` plus the
  `PORTAL_ROUTES` identity. Nothing else in the suite fails.

Pending acceptance: live backend/CORS with a real customer session (own list only, cross-customer
403/404), manual cross-audience checks in a browser (customer deep link into `/admin`, staff deep link
into `/portal`, anonymous deep link into both, customer first login with a provisional password), and
Chrome/Edge/Firefox keyboard and responsive checks of the portal shell and its records. The customer
own-request detail now exists (section below); own orders and own support remain unimplemented, and
no role-aware API authorization is claimed: the backend remains authoritative.

## WP10 T3 — Own request detail in the portal

S7 with the read side of M04/RF04/HU04/P05 and the customer entry view P11
(RNF08/RNF09/RNF10/RNF12). A customer can open one of their own service requests from the portal list
at `/portal/requests/:id`, read-only, inside the existing guarded portal shell. Nothing writes: no
cancel, no edit, no status action, no order creation and no staff destination.

- **Route and identity**: `requests/:id` is a lazy child of the same `portal` group, declared after the
  static `requests` path so the section always wins, and it inherits the shell's `portalGuard`
  audience decision without repeating it or adding a local provider. The id must be a positive decimal
  int32; a malformed, zero, negative, fractional, non-numeric or out-of-range value dispatches no read
  and renders a safe «no disponible» state instead of guessing an identity.
- **Caller scope, not a permission claim**: no customer id, ownership claim or permission is sent or
  displayed beyond the payload. A request that is not the caller's answers `404`, which is rendered as
  «no disponible» — never as a permission hint, never as a retryable transient failure, and it drops an
  already verified record because the answer is authoritative. A `404` on a refresh of a verified
  record replaces it with the same unavailable state instead of keeping stale data.
- **Projection**: only supplied fields are printed — request id, property, service type, desired
  calendar date, the supplied UTC register/update instants, the supplied status code as a text badge and
  the submitted description as plain text. Nullable values use the project's existing «No registrado»
  copy, dates are printed as the supplied calendar string and instants as the supplied UTC value, so no
  browser timezone shifts them. Staff-only payload data (for example the registering operator) is not
  projected, and no status, owner, total or amount is invented.
- **Reads and states**: the existing root `ServiceRequestsStore` keeps the documented 30000 ms
  success-only freshness, ref-counted reads, same-id stale data and session/SSR fencing; the page owns
  only its route identity, its state feedback and its cancellation. Route identity is
  `distinctUntilChanged`, the observation is `switchMap`ped and destroyed with the route
  (`takeUntilDestroyed`/`DestroyRef`), and a replaced session cancels the previous read before the new
  identity gets its own read; same-session renewal preserves the work. States are loading, an
  `Actualizando solicitud…` refresh over verified data, the verified record, a retryable transient error
  that keeps the verified record and offers a GET-only `Reintentar`, and the two distinct
  «no disponible» variants (invalid link and caller-scoped `404`) with no retry at all.
- **Return context**: the back link to `Mis solicitudes` keeps the list's effective paging when the URL
  carries a valid `page`/`size` pair, and the portal list now adopts that pair on entry as its initial
  root-store read, so list → detail → return lands on the page the customer came from. The contract is
  the one the operations lists already use: `page` is a zero-based index and `size` the page length,
  both digits-only, with `page × size` a safe integer and `size` at most the documented backend maximum
  of 100. Missing, duplicated, negative, fractional, non-numeric, out-of-int32 or over-maximum values
  fall back to `page=0&size=20` as a pair — never a clamped size, never an invented offset — and the
  request still carries only `pagina`/`tamanio`. The list itself never writes paging back to the URL,
  so its own navigation keeps its in-memory behavior, and URL paging causes no read on the server
  platform.
- **Tests first**: the detail spec covers id validation without any dispatch, the literal projection and
  the absence of write/staff affordances, the caller-scoped `404` as a distinct state, the `404`
  overriding a verified record, stale retention during refresh and transient failure with a GET-only
  retry, the return link with and without valid paging, session-replacement and route-destruction
  cancellation, and no read on the server platform. The list spec adds the entry contract: a valid
  pair adopted as the initial request, the malformed/duplicated/over-maximum matrix falling back to
  `page=0&size=20` with only `pagina`/`tamanio` on the wire, no out-of-contract size, and the
  list → detail → return round trip landing on the same effective page. RED was a compile failure for
  the missing `PortalRequestDetailPage` and, for the entry contract, the list still dispatching
  `pagina=0&tamanio=20` for every URL pair (4 cases); afterwards the three focused portal files pass
  43/43 and a deliberate mutation of the `NOT_FOUND` treatment fails exactly the three `404`-dependent
  cases.

Pending acceptance: live backend/CORS with a real customer session (own request detail, cross-customer
`404`), rendered Chrome/Edge/Firefox keyboard and responsive checks of the new detail, and a manual
pass over the list → detail → return round trip with a real page of results. Own support remains
unimplemented; own service orders are delivered by the T4 section below, and the backend remains the
authority on scope: the frontend validates shape and contract, never permissions.

## WP10 T4 — Own services (orders) in the portal

S7 with the read side of M05/RF05/HU05/P06 and the customer entry view P11
(RNF08/RNF09/RNF10/RNF12). A customer now reads their own service orders at `/portal/services` and
`/portal/services/:id`, read-only, inside the existing guarded portal shell. «Mis servicios» stops
being a planned section and becomes a real destination, so the portal navigation has no dead entry.

- **Routes**: `services` and `services/:id` are lazy children of the same `portal` group, with the
  static list declared before its own `:id` child, and they inherit the shell's `portalGuard`
  audience decision without repeating it or adding a local provider. `/portal` still opens
  `requests`, the shell keeps only brand/session/`Salir` and the two section links, and no KPI, no
  sidebar and no administrative affordance is added.
- **Caller scope, not a permission claim**: the backend already scopes `GET /api/ordenes` and
  `GET /api/ordenes/{id}` to the caller, so no customer id, ownership claim or permission is sent or
  displayed. Only `pagina`/`tamanio` travel on the list; the detail sends no parameter at all. An
  order that is not the caller's answers `404`, rendered as «no disponible» — never a permission
  hint, never a retryable transient failure, and it replaces an already verified record because the
  answer is authoritative. No row is filtered or sliced locally and no total is invented.
- **Privacy on this surface**: this is the customer-facing view, so it prints strictly less than the
  staff screens. The order detail wrapper carries the property block with `instruccionesAcceso` and
  `codigoPuerta`, and those two fields are dropped from the projection — they never reach the
  template, an accessible name, a `title` or any attribute. Assigned staff appear by **name and role
  only**; the supplied `telefono` is never projected. The list also omits the customer column, the
  estimated amount and the assigned staff entirely.
- **List projection**: the supplied order code, the supplied status text (`estadoNombre`) in a badge
  whose text carries the value, the supplied property and service type, and the supplied schedule
  date plus start/end clock text printed literally (no timezone shifting, no reformatting). Records
  are a real table above 64rem of available container width and cards below it, both labelled
  `Mis servicios de limpieza`; rows link to their own detail carrying the effective `page`/`size`.
- **Detail projection**: supplied fields only — id, code, origin request id, service type, estimated
  duration and amount as supplied, register/update instants as the supplied UTC value, the safe
  property fields (alias, address, city, region, postal code, area, rooms, bathrooms, pets), the
  schedule date and clock text, the assigned staff name and role, and the observation as plain text.
  Nullable values use the existing «No registrado» copy. Nothing writes: no schedule, no team change,
  no cancellation, no status change and no administrative destination — the only link is the way
  back.
- **Reads and states**: the existing root `ServiceOrdersStore` keeps the documented 30000 ms
  success-only freshness, shared ref-counted reads, same-key stale data, the 20-entry pinned registry
  and session/SSR fencing; the pages own only their query/route identity, their state feedback and
  their cancellation. Matrix: loading, `Actualizando servicios…`/`Actualizando servicio…` over verified
  data, verified rows or record, verified empty (`Aún no tienes servicios`), a distinct out-of-range
  empty state, a retryable transient error that keeps the verified data and offers a GET-only
  `Reintentar`, one fenced out-of-range recovery per user action on the list, and the two
  «no disponible» variants (invalid link and caller-scoped `404`) with no retry at all.
- **Entry paging**: the list adopts the same `page`/`size` contract T3 established — read once from
  the route snapshot, `offset = page × size`, whole-pair fallback to `page=0&size=20` for anything
  missing, duplicated, negative, fractional, non-numeric or out of int32, and a size above the
  documented maximum of 100 never dispatched. The list never writes paging back, and the detail's
  return link restores the effective page the customer came from.
- **Customer-scope redaction (live-acceptance fix)**: live acceptance with a real CLIENTE session
  found the reused operations decoder rejecting a perfectly valid `200`. For the customer view the
  backend nulls `programaciones[].registradoPor`, `historial[].usuario` and `asignados[].telefono`
  while deliberately keeping `propiedad.instruccionesAcceso` and `codigoPuerta`, and the
  status-history actor was being decoded with the non-nullable text rule. `OrderStatusHistorySummary`
  now declares `userName: string | null`, decoded like its two already-nullable siblings
  (`ScheduleSummary.registeredByName`, `AssignedStaffSummary.phone`): no fallback name, empty string
  or extra field is invented, and no id, date, enum, count or money rule was loosened. The orders
  list needed no change because it carries the same two redacted fields through the same
  `restringir` and both were already nullable; `SolicitudResponse.registradoPor` stays required
  because the backend always sends a name there, and support's `autor` was already honest. The staff
  order detail takes the file's own «No registrado» copy for that cell, so no null renders as an
  empty cell. The portal projection is untouched: it still hides the access fields and the staff
  phone even though the customer payload still carries the first two.
- **Tests first**: the two new specs cover id validation without any dispatch, the literal projection
  with staff name/role, the caller-scoped `404` as a distinct state that also drops a verified record,
  stale retention during refresh and transient failure with a GET-only retry, effective paging
  adoption plus the list → detail → return round trip, the entry-paging fallback matrix, the privacy
  rule (no access instruction, no door code, no staff phone anywhere in the rendered text or
  attributes), the absence of any write affordance, and no read on the server platform. The route spec
  pins the two new children and the second real navigation entry. RED was a compile failure for the
  missing `PortalServicesPage`/`PortalServiceDetailPage`; afterwards the five portal spec files pass
  83/83. The redaction fix added one behavioural case at each owning boundary — a customer-scoped
  payload with those three nulls decodes successfully without changing the projected field set, and
  the same payload renders the record on this surface while the access instructions, the door code
  and the staff phone stay out of the rendered text and attributes.

Pending acceptance: live backend/CORS with a real customer session (own order list and detail,
cross-customer `404`, and a re-run of the customer-scoped detail that failed before the redaction
fix), rendered Chrome/Edge/Firefox keyboard and responsive checks of both new
screens, an independent redaction check of the property access fields on this surface, and a manual
pass over the list → detail → return round trip with a real page of results. Own support (T5) and the
own-attention creation (T6) remained unimplemented at this checkpoint — the T5 section below
supersedes the own-support part with a read-only list and detail, while own-attention creation is
still T6 and still unimplemented — and no role-aware API authorization is claimed: the backend stays
authoritative on scope.

## WP10 T5 — Own support in the portal

S7 with the read side of M09/RF11/HU11/P10 and the customer entry view P11
(RNF08/RNF09/RNF10/RNF12). A customer now reads their own support attentions at `/portal/support`
and `/portal/support/:id`, read-only, inside the existing guarded portal shell. «Soporte» stops being
a planned section and becomes a real destination, so the portal navigation has no dead entry.
**Creating an own attention is T6 and is not part of this slice**: no create form, no reply, no state
change, no close and no staff action exists on either screen.

- **Routes and navigation**: `support` and `support/:id` are lazy children of the same guarded
  `portal` group, with the static list declared before its own `:id` child, and they inherit the
  shell's `portalGuard` audience decision without repeating it or adding a local provider. The shell
  gains exactly one section link (`Soporte`); no KPI, no sidebar, no admin affordance and no dead
  destination is added, and the rest of the shell is unchanged.
- **Caller scope, not a permission claim**: the backend already scopes `GET /api/atenciones` and
  `GET /api/atenciones/{id}` to the caller, so no customer id, ownership claim or permission is sent
  or displayed. Only `pagina`/`tamanio` travel on the list and the detail sends no parameter at all.
  No row is filtered or sliced locally and no total is invented.
- **States, supplied and literal**: the vocabulary is the backend's closed
  `RECIBIDA`/`EN_REVISION`/`RESUELTA`/`CERRADA` set with its supplied `estadoNombre`. The portal
  prints that supplied text as received and never derives, translates or invents a state, and it
  encodes no transition — which target state is legal stays the staff screen's and the backend's
  authority. There is no status catalog endpoint and none is invented here.
- **List projection**: the supplied subject, type name, state text and registration instant, plus the
  attention id, printed literally. Records are a real table above 64rem of available container width
  and cards below it, both labelled `Mis atenciones de soporte`; rows link to their own detail
  carrying the effective `page`/`size`. No filters, KPIs, totals, customer column or internal contact
  data are added.
- **Detail projection**: supplied fields only — subject as a heading, the supplied state text as a
  badge whose text carries the value, attention id, type name, register and close instants as the
  supplied UTC value, the description as plain text, and the follow-up list in server order. Nullable
  values use the existing «No registrado» copy. The only link is the way back.
- **Redaction on this surface**: a follow-up whose author is null renders an explicit redacted case
  (`Autor no mostrado`, marked in the DOM), never a substituted name, id, role or other field, and
  never a generic "staff" label that pretends someone is identified. A supplied author is printed as
  it arrived, and the supplied orientation (`Del cliente`/`Del personal`) is never combined into an
  identity claim. The frontend does not certify backend redaction.
- **Reads and states**: the existing root `SupportRequestsStore` keeps the documented 30000 ms
  success-only freshness, shared ref-counted reads, same-key stale data, the pinned registry and
  session/SSR fencing; the pages own only their query/route identity, their state feedback and their
  cancellation. Matrix: loading, `Actualizando atenciones…`/`Actualizando atención…` over verified
  data, verified rows or record, verified empty (`Aún no tienes atenciones`), a distinct
  out-of-range empty state, a retryable transient error that keeps the verified data and offers a
  GET-only `Reintentar`, one fenced out-of-range recovery per user action on the list, and the two
  «no disponible» variants (invalid link and caller-scoped `404`) with no retry at all. A `404` on a
  refresh replaces a verified record because the answer is authoritative.
- **Entry paging**: the list adopts the same `page`/`size` contract the portal lists already use —
  read once from the route snapshot, `offset = page × size`, whole-pair fallback to `page=0&size=20`
  for anything missing, duplicated, negative, fractional, non-numeric or out of int32, and a size
  above the documented maximum of 100 never dispatched. The list never writes paging back, and the
  detail's return link restores the effective page. This module additionally refuses an answer whose
  effective size differs from the requested one, because those rows would not start at the asked
  offset; the portal list therefore navigates with the effective returned metadata and surfaces that
  refusal as its retryable error instead of adopting a different size.
- **Tests first**: the two new specs cover id validation without any dispatch, the literal projection
  (including a supplied state text no lookup would produce), the null-author redaction with the
  absence of a substituted identity and the preserved server order, the caller-scoped `404` as a
  distinct state that also drops a verified record, stale retention during refresh and transient
  failure with a GET-only retry, navigation with the effective metadata plus the size-mismatch
  refusal, the entry-paging fallback matrix, the list → detail → return round trip, the absence of any
  create/reply/transition control, and no read on the server platform. The route spec pins the two new
  children and the third real navigation entry. RED was a compile failure for the missing
  `PortalSupportPage`/`PortalSupportDetailPage`; afterwards the seven portal spec files pass 126/126.
  A deliberate mutation (printing the state code instead of the supplied name) failed exactly the two
  literal-state cases, and making the `404` a transient failure failed exactly the three
  `404`-dependent cases.

Pending acceptance: live backend/CORS with a real customer session (own attention list and detail,
cross-customer `404`, the `ATENCION_LEER_PROPIA` authority), an independent redaction check with a
real null-author follow-up, rendered Chrome/Edge/Firefox keyboard and responsive checks of both
screens, and a manual pass over the list → detail → return round trip with a real page of results.
Surveys, attachments/photos and message templates remain unimplemented, and no role-aware API
authorization is claimed: the backend stays authoritative on scope. Creating an own attention is the
next slice (T6, below) and is no longer planned.

## WP10 T6 — Registering an own support attention

S7 with the customer-write side of M09/RF11/HU11/P10 and the customer entry view P11
(RNF08/RNF09/RNF10/RNF12). `/portal/support/new` is the **only write in the customer portal**: the
customer registers one support attention in their own name. Everything else in the portal still
reads and never mutates — no own-service-request creation, no reschedule, no cancellation, no
survey, no attachment and no state change.

- **Route**: `support/new` is a lazy child of the same guarded `portal` group, declared **before**
  `support/:id` so the static path is never taken for an id, and it inherits the shell's
  `portalGuard` audience decision without repeating it or adding a local provider. The «Soporte» list
  gains exactly one control, `Nueva atención`, which opens it; nothing else on the list changed.
  `canDeactivate` carries the pending-write decision: a POST in flight refuses the navigation and the
  page reports that it must finish first, so the request is never abandoned mid-flight. A confirmed
  creation allows the navigation it triggers itself.
- **Own audience, not an identity claim**: the payload is `idCliente: null`. The backend resolves the
  customer from the session, so this form has **no customer picker**, never sends, infers or displays
  a customer id, and shows no staff, administrative or role affordance. The copy states that the
  attention is registered in the customer's name and that the support team updates its state; it
  promises no response time, no resolution and no state transition the backend does not guarantee.
- **Payload**: exactly `idTipo`, `asunto` and `descripcion` — plus `idOrden` only when the customer
  chose one of their own services. Asunto is required and trimmed to at most 150 characters,
  descripción is required and trimmed to at most 4000, both matching the documented wire limits that
  the existing transport already validates; over-limit text is refused, never truncated. No actor,
  status, availability, browser-today or generated id is sent.
- **Optional own service**: `idOrden` is optional and can only reference one of the customer's own
  orders. The picker is populated from the existing caller-scoped `GET /api/ordenes` read
  (`ServiceOrdersStore`, one page at a time with its paging inside the panel and an explicit reload),
  never from a global catalog, and it never accepts a typed id. Because the picker is a choice rather
  than a text field, the page keeps the receipt of the ids its own reads actually returned and
  re-verifies the chosen id at dispatch; a choice whose verified read is gone is blocked with a
  visible message instead of being trusted. Labels show the supplied code, service type and property;
  the customer's own name is not printed, and no access instruction or door code is ever exposed.
- **Type catalog**: `idTipo` comes from the existing finite `GET /api/catalogos/tipos-atencion` read
  with its own loading, verified-empty, failure and explicit retry states. Only a verified, unexpired
  option is dispatchable; a supplied name is printed as received and no status catalog is invented.
- **Write discipline**: one POST through the existing root `SupportRequestsStore.createRequest` — no
  second HTTP path and no widened feature boundary. `pending` is the form's submitting state plus the
  store's writing gate, so a duplicate submission is refused rather than dispatched. The page keeps
  all three writes of that store serialized by its own shared gate. Inline errors preserve the draft,
  the page never resends the POST by itself, and an outcome the client cannot prove (network failure,
  unexpected status, invalid answer) is reported as *unconfirmed* with the advice to check «Soporte»
  before retrying. Feedback follows a confirmed success only. A session replacement fences the answer
  — the write is unsubscribed, the draft/choices/receipts of the previous identity are dropped and no
  completion navigates or reports — and route destruction completes the wait instead of leaving the
  form stuck. Cancelling cannot undo a dispatched write.
- **Destination**: a confirmed success opens the created attention at `/portal/support/{id}`. When the
  answer carries no usable id, the page returns to `/portal/support?creada=1` instead of guessing a
  destination, and the list prints the confirmed message there; that flag is presentation only and
  never travels as a read filter, so the list still asks for `pagina`/`tamanio` alone.
- **Tests first**: the new page spec covers the entry reads (supplied type catalog plus the
  caller-scoped own-orders page with no `idCliente`), the required type/subject/description
  validation with the accessible help/error association and the optional service left without error,
  the exact payload `{ idCliente: null, idTipo, asunto, descripcion }` with no `idOrden` key and
  trimmed text, the associable own service sending only its id, clearing that association, one
  pending write with a duplicate submit refused, Cancel disabled and the navigation refused, an
  inline `400` error that keeps the draft, an unconfirmed `503` reported as unconfirmed, an
  authoritative `403` reported as such, no replay of the POST in any of them, the session-replacement
  fence (write unsubscribed, draft dropped, no navigation), the destination without an id returning to
  the list, and no read or write on the server platform. The route spec pins the new child between
  `support` and `support/:id` with its `canDeactivate` and opens it as a real route; the list spec
  pins the single creation action and the confirmation. RED was a compile failure for the missing
  `PortalSupportCreatePage` and leave guard; afterwards the eight portal spec files pass 140/140. A
  deliberate mutation (`customerId: null` → a customer id) failed exactly the four payload cases.

Pending acceptance: live backend/CORS with a real customer session and the `ATENCION_CREAR_PROPIA`
authority, the real accepted `201` payload and its error statuses, a cross-customer attempt proving
the backend rejects a foreign `idOrden`, rendered Chrome/Edge/Firefox keyboard and responsive checks
of the form, and a manual pass over list → form → created detail. The `creada` confirmation has only
been observed with deterministic tests, since the real transport refuses an id-less answer.

## WP10 T7 — «Mi perfil» of the customer

S2 with M03/RF03/HU03 context for the customer's own record (RNF08/RNF09/RNF10/RNF12). `/portal/profile`
is the customer's own profile inside the existing guarded portal shell, and «Mi perfil» becomes the
fourth real navigation entry, so the portal still shows no dead destination.

- **Route**: `profile` is a lazy child of the same guarded `portal` group — a static leaf, with no id
  child, no local guard and no local provider, inheriting the shell's `portalGuard` audience decision.
- **Contract**: `GET /api/clientes/me` (`CLIENTE_LEER_PROPIO`) returns the caller's own
  `ClienteResponse`, the same fifteen-key shape as the staff detail, and answers `404` when the
  authenticated account is not linked to a customer record. The frontend sends no id and no query: the
  backend resolves the customer from the session. `PUT /api/clientes/me` (`CLIENTE_ACTUALIZAR_PROPIO`)
  accepts **only** `nombre` and `telefono`; `tipo`, `activo`, `correo`, `crearCuenta` and `password` are
  rejected with `400` naming the offending field, and the client never builds them.
- **The email is read-only by product decision**: it is the sign-in identity and it is shared with the
  account row, so only the office changes it. The screen prints it in a read-only input with that
  single explanation; it is not editable, not re-sent, and no "request a change" workaround is offered.
- **What the screen shows**: the supplied `nombre`, `correo`, `telefono` and `tipo` only. No id, no
  account state, no timestamp, no fiscal/origin/external field and no invented label: a null phone
  prints as «No registrado».
- **Edit**: Signal Forms over `nombre` and `telefono` only, prefilled from the verified record when
  editing starts and never rewritten by a later read. The payload is exactly `{ nombre, telefono }` —
  name trimmed (required, up to 150) and phone trimmed with the documented staff rule (7–30 characters,
  `+`, digits, spaces, parentheses and hyphens), blank turned into `null`. The form carries no email,
  type, active flag or account field at all.
- **Write discipline**: one PUT through a new root `CustomersStore.updateOwnProfile` action and the
  existing stateless use case/repository/source chain. Pending blocks a duplicate submit and refuses
  to dismiss the form (Cancel and the overlay-free form stay until the answer settles); a documented
  `errores.nombre`/`errores.telefono` marker is bound to its own input while any other `400` keeps a
  general inline message, and server copy is never rendered. Safe failures keep the draft and never
  replay the write; feedback appears only after a confirmed success, and that success alone expires
  the cached profile so the mounted observer re-reads it exactly once.
- **Read states**: loading, verified record, transient failure with an explicit GET-only retry that
  keeps verified data (and a visible stale warning), and the stable «sin perfil vinculado» state for the
  documented `404`, which offers no retry because repeating the same GET cannot change the answer. The
  read reuses the approved 120000 ms success-only freshness for customer profile data, ref-counted
  flights and the root store's session fencing; nothing dispatches on the server platform, and a
  session replacement or route destruction cancels the read (renewal within the same session preserves
  it).
- **Tests first**: the transport spec covers the own-profile GET without query, the `404` failure code,
  malformed payloads, the exact two-key PUT body (including a caller carrying extra fields), the
  validation refusals before HTTP, both field markers, the unknown-body fallback and the status
  mapping; the action table pins both use cases to the repository; and the new page spec covers the
  read states, the 404 state, the read-only email, the absence of ids/account state/timestamps, the
  payload with trimmed name and null blank phone, validation before dispatch, the pending duplicate and
  dismissal guards, the inline `400` with the draft preserved, confirmed-only feedback with exactly one
  post-write read, session replacement, route destruction and the server platform. The route spec pins
  the new child and the fourth navigation entry; the portal dependency census includes the new page.
  RED was a compile failure for the missing repository methods and the missing component.

Pending manual/live acceptance: the real `GET`/`PUT /api/clientes/me` with a customer session and the
`CLIENTE_LEER_PROPIO`/`CLIENTE_ACTUALIZAR_PROPIO` authorities, the real `404` of an unlinked account,
the accepted validation `400` bodies and their field markers, live CORS, and rendered
Chrome/Edge/Firefox keyboard/responsive checks of the read view and the form.

## WP10 — One portal paging contract (and the paging inventory)

RF15/HU15/P11 (RNF09/RNF10/RNF12). The portal's `page`/`size` vocabulary used to exist twice: the two
request/order lists and their details imported the helpers of the operations feature, while support
did the same work in a portal-local module. Both were byte-for-byte copies of the same reader, the
same serializer and the same route-id parser, so a rule fixed in one place could silently stay broken
in the other.

- **One module owns it**: `src/app/experiences/portal/presentation/navigation/portal-paging.ts`.
  `portalPageContext` reads the pair once from a route snapshot and returns the read context
  (`offset = page × size`, `limit = size`); `portalPagingParams` serializes the effective page a row
  link or a return link carries; `portalRouteId` accepts a record id; `portalMaxPageSize` (100) and
  `portalFirstPage` (0/20) are the only copies of those two numbers in the portal.
- **Whole-pair fallback, never a clamp**: missing, incomplete, duplicated, malformed, fractional,
  negative, out-of-int32 or above-maximum input becomes `0/20` as a pair. The maximum belongs to the
  reader, so an out-of-contract size is structurally impossible to dispatch — a page can no longer
  forget the guard, because it no longer has one. The serializer refuses exactly what the reader
  refuses (unaligned offsets, invalid numbers, size above 100), so a link the portal emits is always a
  link the portal accepts back; both sides also insist on a `page × size` safe integer.
- **Consumers**: the three lists (`/portal/requests`, `/portal/services`, `/portal/support`) read
  their entry context there and serialize row links from the effective returned metadata; the three
  details (`/:id`) parse their id and build their return link there; the own-support form takes the
  documented first page from the module for its local own-orders picker (which is not URL paging). No
  portal page keeps a private copy of the reader, the arithmetic or the maximum.
- **Removed**: `navigation/portal-support-page-context.ts` (the support-specific duplicate). The
  operations helpers are untouched — `service-requests-page.ts`, `service-request-detail-page.ts`,
  `service-orders-page.ts` and `service-order-detail-page.ts` still consume them, and they are that
  feature's own contract; the portal simply stopped importing them.
- **Tests first**: `navigation/portal-paging.spec.ts` is the contract suite and the single home of the
  fallback matrix — zero-based index and offset derivation, leading zeros, the accepted maximum of 100,
  the missing/incomplete/duplicate family, the malformed/fractional/nonpositive family, the
  out-of-int32 family, the over-maximum family that must not be clamped, fresh-object fallbacks, the
  serializer's defaults and refusals, the read→link→read round trip (including a hand-edited pair both
  sides refuse identically) and the route-id matrix. Each list spec keeps its integration proof: valid
  pairs adopted, one representative malformed case per family, no dispatch above the maximum, and the
  list → detail → return landing on the same effective page. The duplicated malformed rows were
  removed from the three list specs (nine rows each: incomplete `size` only, fractional page,
  non-numeric page and size, zero size, int32-overflow size, duplicated `size`, blank page, blank size)
  because that suite now asserts the same cases once. RED was a compile failure for the missing module;
  afterwards the ten portal spec files pass 192/192.
- **Not refactored here**: nothing outside the portal. The inventory of the rest of `src/app` (below)
  decides what, if anything, deserves a second slice; the portal's own 1-based navigation arithmetic
  (`currentPage`, `pageCount`, `goToPage`, out-of-range recovery) also stays per page, because it is a
  paging *control* over an already-decided query, not the URL/read contract this module owns.

### Paging and page-size inventory outside the portal

| Helper / place | Owner | Consumers | Verdict |
| --- | --- | --- | --- |
| `navigation/service-request-page-context.ts` (`page`/`size`) | operations | `service-requests-page`, `service-request-detail-page`, its spec | **Same concept** as the portal module (zero-based page → offset, whole-pair fallback, routes id), different feature contract; left untouched |
| `navigation/service-order-page-context.ts` | operations | `service-orders-page`, `service-order-detail-page`, its spec | **Same concept**, duplicated inside operations; left untouched |
| `navigation/staff-page-context.ts` (`staffPageContext`, `staffPagingParams`, `staffRouteId`, `staffReturnState`, `staffReturnFilters`) | field-operations | `staff-page`, staff profile pages, its spec | Same page/size→offset core **plus** an owner/session return-filter contract the portal has no use for |
| `pages/support-page-context.ts` (`offset`/`limit`) | customer-support | `support-requests-page`, its spec | Same idea with the other URL vocabulary (`offset`/`limit`) and both-sides max-100 enforcement, plus filter/state serialization and `supportRouteId`; genuinely different URL contract |
| `navigation/crm-catalog-page-context.ts` (`crmCatalogPageContext`, `offset`/`limit`) | customers | `customers-page`, `customer-detail-page`, `leads-page`, `lead-detail-page` | Reads `offset`/`limit` directly (no page/size), int32-aligned, no max-100 cap (the transport decides). **Consolidated** from the former `customer-page-context.ts` + `lead-page-context.ts` pair, whose bodies were identical |
| `shared/pagination/normalize-pagination.ts` (`normalizePagination`, limit 1–100 → `Result`) | shared | **none** | Not a URL context: it was the read-query validator, and it had no caller — **deleted** with its spec |
| `shared/pagination/pagination.params.ts` / `.response.ts` | shared | everything above | Shared vocabulary (`PaginationParams`, `NormalizedPagination`, `PaginationResponse`), not a helper |
| `shared/components/table-pagination/table-pagination.ts` | shared | portal lists, users, customers, leads, staff, support, operations | Presentational 1-based control; emits a page number and computes no offset — same *UI* concept, not the same contract |
| `pagina`/`tamanio` mapping in `*/infrastructure/source/*-http.validation.ts` | operations, customer-support, field-operations, customers | the HTTP sources | Same arithmetic at the adapter boundary, where it must also validate the returned metadata; moving it would couple transport validation to a navigation helper |
| Inline 1-based paging in pages/dialogs (`currentPage`, `pageCount`, `goToPage`, `(page - 1) * limit`, `Math.floor((total - 1) / limit) * limit`) | portal lists and create page, support inbox/editor dialogs, customers, leads, staff, operations lists/editor, users page, audit viewer, user sessions, `CatalogCombobox` | their own templates | **Look-alike**: control arithmetic over an existing query, 12 sites; a shared "page control" helper would be a separate decision, not this contract |

Pending acceptance: live backend/CORS and rendered browser passes for the portal remain the same as
recorded for T2–T6; this change is deterministic-test and typecheck evidence only.

### Portal dependency declaration (dev-server defect, fixed for T2–T6)

The portal pages' `Component.imports` used to be written as spreads of the imported
`HlmAlertImports`, `HlmBadgeImports`, `HlmButtonImports`, `HlmCardImports`, `HlmEmptyImports`,
`HlmFieldImports`, `HlmInputImports`, `HlmNativeSelectImports`, `HlmSpinnerImports`,
`HlmTableImports`, `HlmTextareaImports` and `HlmAvatarImports` constants. That shape is evaluated
twice: once for the component definition, and again by the dev server whenever the page's template is
rebuilt while the page is open, where
`ɵɵreplaceMetadata` hands the rebuilt metadata function a `ɵɵnamespaces` array and the dependencies of
a spread constant are re-resolved **by index**, e.g. `ɵɵnamespaces[7].HlmTextarea`. If the array and
the chunk the browser loaded then differ by one entry — which the dev server can produce, because its
`templateUpdates` map keeps a stored module across a code rebuild — the lookup reads a property of
`undefined`, `Cannot read properties of undefined (reading 'HlmTextarea')` is thrown inside
`PortalSupportCreatePage_UpdateMetadata`, and the form never renders. That was observed on
`/portal/support/new`: the type select stayed absent for over 30 s, and the same exception appeared on
a hot-reloaded server where the form still painted. Reproduced deterministically by serving a
nine-namespace stored module (`ɵhmr8.HlmTextarea`) to a chunk that exposes eight.

`/portal/support/new` now imports the twenty-odd directives and components it actually uses **by name**
— the same directive set, one class per Helm export — so the rebuilt metadata receives them as plain
arguments and dereferences no component symbol through `ɵɵnamespaces` at all (verified: the served
update module references only the `@angular/core` namespace). The rest of the portal carried the same
skew and logged the same exception in live acceptance: `HlmCaption` on `/portal/requests` and
`/portal/support`, `HlmSpinner` on both detail pages. Every portal component now declares its
dependencies the same way — `PortalRequestsPage`, `PortalRequestDetailPage`, `PortalServicesPage`,
`PortalServiceDetailPage`, `PortalSupportPage`, `PortalSupportDetailPage` and the `PortalShell` that
wraps them — naming exactly the Helm classes each template uses (`HlmAlert`/`HlmAlertTitle`/
`HlmAlertDescription`, `HlmBadge`, `HlmButton`, `HlmEmpty` with header/title/description, `HlmSpinner`,
`HlmTable`/`HlmTableContainer`/`HlmTHead`/`HlmTBody`/`HlmTr`/`HlmTh`/`HlmTd`,
`HlmAvatar`/`HlmAvatarFallback`). Each page keeps its previous directive set — no template used
`HlmAlertAction`, `HlmEmptyContent`, `HlmEmptyMedia`, `HlmCaption` or `HlmTFoot` — so the rendered
result and behaviour are byte-identical. No `forwardRef`, no dynamic import and no change to a
template, a payload, a guard, a store or a test expectation.

- **Guard**: `src/app/experiences/portal/presentation/portal-component-imports.testing.ts` reads each
  component's source from disk — a fixture-based render test builds the metadata and the component
  definition from one revision, so it cannot see this class of breakage — and asserts every
  `imports: [...]` entry is a plain identifier, with no spread and no `*Imports` constant.
  `portal-component-imports.spec.ts` runs it over an explicit census of the eight portal component
  sources, so a new page has to be registered there and a reintroduced constant fails without a browser.
  `portal-support-create-page.spec.ts` keeps its original case, now through that shared helper.
- **Live measurement** (real backend, CLIENTE session, `http://localhost:4200`): zero console errors on
  `/portal/requests`, `/portal/requests/43`, `/portal/services`, `/portal/services/25`,
  `/portal/support`, `/portal/support/10` and `/portal/support/new`, at 1440 px and again at 390 px,
  with no horizontal document overflow at either width. The own-support form was rendered and never
  submitted, so no attention was created, and no credential is stored in any artifact.
- **Why the first post-fix run still threw**: the running dev server keeps one stored update module per
  component in its `templateUpdates` map, written when that component's template was last rebuilt, and
  serves it for the rest of the process lifetime. It still held the pre-fix modules for the pages
  visited before the fix, so those pages kept throwing
  `Cannot read properties of undefined (reading 'HlmAlert')` — the first entry of the stale
  `HlmAlertImports` chain — even though the component chunk already carried the fix; `/portal/services`
  and `/portal/services/:id`, never visited before, were clean on that same run. A template edit
  replaces the stored module, after which every page measured zero without restarting the server. That
  is the skew documented above, observed at runtime, and the declaration fix is what removes the
  index-based re-resolution the skew depends on.

Pending acceptance: rendered Chrome/Edge/Firefox keyboard and responsive passes, an independent review
of this change, and the live CORS/authorization/redaction runs already listed for T2–T6.

## Dev-server configuration: component HMR disabled

The dev server is the same defect class, so the project now configures it explicitly: the `serve`
target in [angular.json](../angular.json) sets `hmr: false` with `liveReload` left on, while the
defaults stay `development`.

- **What the setting does**: the dev server still rebuilds and the browser still refreshes the page on
  save; only component hot *replacement* is off. Nothing about the build, the budgets, the tests or the
  production output changes, because the option lives on `serve` alone.
- **Why**: with component HMR on, the dev server re-applies stored component metadata in the browser and
  re-resolves an `imports` entry **by index** into a `ɵɵnamespaces` array, exactly as described above.
  Whenever a component declares its Helm dependencies through an `*Imports` constant (`...HlmButtonImports`
  and friends, still the shape in the auth, admin-shell and customer-support components), a stored module
  and the chunk it is handed can differ by one entry, and the lookup throws
  `TypeError: Cannot read properties of undefined (reading 'HlmX')` and leaves the component without its
  directives — the form or card simply does not render. Disabling component HMR removes that path for
  every component in the app, not only for the portal sources already rewritten to name their
  dependencies individually.
- **What is lost**: component hot replacement and style hot replacement. An edit now costs a full page
  reload instead of swapping a template or a stylesheet in place, which is the accepted trade for a dev
  server that does not corrupt component metadata.
- **Narrower alternative**: anyone who wants HMR back can keep the `hmr` flag and run the server with
  `NG_HMR_TEMPLATES=0`, which disables only component *template* hot replacement while leaving the rest
  enabled. That is a per-run environment choice, so it is deliberately not committed to `angular.json`.
- **Still guarded**: the portal's census spec
  ([portal-component-imports.spec.ts](../src/app/experiences/portal/presentation/portal-component-imports.spec.ts))
  keeps failing on a reintroduced `*Imports` spread in those sources, because naming dependencies
  directly remains the correct declaration regardless of the global switch. It covers the portal only;
  the `serve` setting covers every other component.

Pending acceptance: this is a configuration change, so it carries no rendered evidence. The served
behaviour was not re-measured in a browser, and the remaining `*Imports` constants outside the portal
stay a live-browser risk if HMR is re-enabled without `NG_HMR_TEMPLATES=0`.

## Documented `404` delivery to detail adapters

Cross-cutting fix for every detail screen that already documented an authoritative absence: the auth
interceptor used to turn **every** protected-API `404` into a generic `UNEXPECTED` error, so no
adapter could reach its typed not-found code and each page rendered the *retryable* error state
instead of the «no disponible» one. The defect was measured live by opening a record the backend
refuses with `404` (another customer's request), and it invalidated the documented `404` of the
portal request/service/support details, the portal own profile ("sin perfil vinculado") and every
staff/customer detail that maps `CUSTOMER_NOT_FOUND`/`NOT_FOUND`.

- **The seam**: the existing opt-in context token (`PRESERVE_API_CONFLICT` / `apiConflictContext()`)
  now also delivers a `404` to the adapters that ask for it, next to `409` and `400`. Nothing else
  widened: `401` keeps its credential invalidation and no-replay rule, `403` stays `FORBIDDEN`, `5xx`
  and status `0` keep their mapping, and a request without the opt-in keeps the generic mapping — so a
  `404` on a list, a write or any unopted call behaves exactly as before. See
  [the interceptor contract](../src/app/core/http/README.md).
- **Opted-in readers** (each maps the status to the typed code it already had, so no new error code was
  introduced): customer detail `GET /api/clientes/{id}` and own profile `GET /api/clientes/me`
  (`CUSTOMER_NOT_FOUND`), operations request `GET /api/solicitudes/{id}` and order
  `GET /api/ordenes/{id}` (`NOT_FOUND`), customer-support attention `GET /api/atenciones/{id}`
  (`NOT_FOUND`), staff detail `GET /api/personal/{id}` and own staff profile `GET /api/personal/me`
  (`NOT_FOUND`), and customer history `GET /api/clientes/{id}/historial` (`CUSTOMER_NOT_FOUND`).
  Their list endpoints (`GET /api/personal` included) do not opt in.
- **Consumers unchanged**: the pages already projected the authoritative absence as its own
  non-retryable state (`data-detail-unavailable`, `data-profile-missing`) and excluded it from the
  retryable error, so the fix required no page rewrite — only proof that the state is now reachable
  through the real interceptor.
- **Tests**: `auth.interceptor.spec.ts` pins opted-in `404` preservation (status, body, session kept,
  nothing replayed) and the non-opted-in `404` staying generic next to the unchanged `401`/`403`/`5xx`
  cases; `customer-not-found-http.spec.ts`, `operations-not-found-http.spec.ts` and
  `customer-support-not-found-http.spec.ts` run the real interceptor end-to-end and prove each reader
  produces its typed code while a list or write without the opt-in keeps today's mapping; the four
  portal page specs gained an interceptor-mode case proving the distinct non-retryable state renders
  and the retryable error does not. Observed RED: only the new opted-in/seam cases failed, while the
  pre-existing cases kept passing.

### Same defect class: remaining readers and the missing UI state

The first pass left three surfaces outside it: the two field-operations staff reads, the customer
history read and the staff customer detail presentation. All three are now closed.

- **Staff reads** `GET /api/personal/{id}` and `GET /api/personal/me` now opt in and deliver the typed
  `NOT_FOUND` the adapter already had through the real interceptor; `GET /api/personal` (directory)
  stays generic. [StaffDetailPage](../src/app/features/field-operations/presentation/pages/staff-detail-page/staff-detail-page.ts)
  splits its single error alert: `NOT_FOUND` renders the definitive `data-staff-unavailable` state
  ("no está disponible … volver a consultarlo no cambiará el resultado") with **no** `Reintentar`
  button, while every other code keeps today's retryable alert and its retry. No page structure,
  read, TTL, session or owner-fence changed.
- **Customer history** `GET /api/clientes/{id}/historial` now opts in and delivers `CUSTOMER_NOT_FOUND`.
  [CustomerHistoryPanel](../src/app/features/customers/presentation/components/customer-history/customer-history-panel.ts)
  renders that code as the definitive `data-history-unavailable` state with no `Reintentar historial`,
  and suppresses the module sections because rendering records for a customer the server says does not
  exist would contradict it. The panel's existing rule is untouched: a `403` or a malformed module
  still fails the whole result with one safe retryable error that keeps verified same-owner stale data.
- **Staff customer detail** already received `CUSTOMER_NOT_FOUND` from its adapter, but rendered one
  combined "no se pudo consultar el cliente. Puede no existir…" alert with a retry. It is now split:
  `CUSTOMER_NOT_FOUND` renders the definitive `data-customer-unavailable` state without a retry
  action, and a transient failure keeps the retryable "No se pudo consultar el cliente." alert with
  its `Reintentar cliente`. Properties are still only requested after a verified customer.
- **Tests**: new `field-staff-not-found-http.spec.ts` and `customer-history-not-found-http.spec.ts` run
  the real interceptor and prove the typed code for both staff reads and for history while the staff
  directory `404` stays generic and opted-in `403`/`5xx`/`0` keep their mapping;
  `staff-detail-page.lifecycle.spec.ts`, `customer-detail-page.spec.ts` and `customer-history.spec.ts`
  prove the rendered absence (attribute present, retry absent) next to a transient failure that still
  offers the retry. Observed RED: exactly the new opt-in/page cases failed before the change; every
  pre-existing `401`/`403`/`5xx`/network and list/write "still generic" assertion kept passing.

Pending acceptance: live backend/CORS runs with a real cross-customer `404` and browser
keyboard/responsive checks for the three states above.

### Same defect class: the last reader, and the code that must not opt in

The last instance was the prospecto (lead) detail and, by declaration, `PROPERTY_NOT_FOUND`.

- **Confirmed real detail read**: `GET /api/prospectos/{id}` (`AcquisitionHttpSource.findLead`) is the
  only detail read in the CRM acquisition boundary, and it documents the authoritative `404`. It now
  passes `apiConflictContext()` and delivers its already-declared `LEAD_NOT_FOUND` through the real
  interceptor. The prospecto list (`GET /api/prospectos`), its writes (`POST`, `PUT`, `DELETE`), the
  follow-up list/registration and the conversion request stay un-opted-in, so an absence on any of
  them keeps today's generic `UNEXPECTED` mapping.
- **`PROPERTY_NOT_FOUND` left alone, deliberately**: the customer-scoped property surface has **no**
  own-property detail read. Its whole contract is the owner list `GET /api/clientes/{id}/propiedades`
  plus `POST` create, `PUT` update and `PATCH …/estado`. `PROPERTY_NOT_FOUND` therefore classifies a
  list or write response that the interceptor never delivers as a `404`, and opting those calls in
  would turn an unexpected absence into a page-level "not found". The declared code stays; the caller
  keeps the generic/conflict-safe behaviour it already had, and the property status dialog and editor
  keep tolerating it as a failure whose record may no longer exist.
- **Page state** [LeadDetailPage](../src/app/features/customers/presentation/pages/lead-detail-page/lead-detail-page.ts)
  had no distinguishable absence: one combined destructive alert with `Reintentar` for `LEAD_NOT_FOUND`
  and every failure alike. It now follows [StaffDetailPage](../src/app/features/field-operations/presentation/pages/staff-detail-page/staff-detail-page.ts)
  and the staff [customer detail](../src/app/features/customers/presentation/pages/customer-detail-page/customer-detail-page.ts):
  `LEAD_NOT_FOUND` renders the definitive `data-lead-unavailable` attribute, the "no está disponible …
  volver a consultarlo no cambiará el resultado" description and **no** `Reintentar` button; every
  other code (network, forbidden, missing session, unconfigured origin, malformed response) keeps the
  retryable alert, its own message and its retry. `LEAD_NOT_FOUND` is only reachable now, so no other
  behaviour, read, TTL, session or owner fence changed.
- **Tests**: new `acquisition-not-found-http.spec.ts` runs the real interceptor and proves the typed
  `LEAD_NOT_FOUND` for `GET /api/prospectos/{id}` while the prospecto list `404`, the prospecto `DELETE`
  `404`, the property list `404` and the property status `404` stay generic without replay;
  `lead-detail-page.spec.ts` proves the definitive state renders with no retry affordance while the
  next record's transient `NETWORK` failure keeps its `Reintentar` (and still refetches that ID).
  Observed RED: exactly the opt-in context assertion and the new absence assertion failed; the rest of
  both files, including every list/write "still generic" case, kept passing.

Pending acceptance: live backend/CORS run with a real `404` on the prospecto detail (cross-tenant or
soft-deleted record) and Chrome/Edge/Firefox keyboard/responsive checks of the new absence state.

## WP11 — Field staff assigned services (T1–T4)

M05/RF10/HU10/P09 with M06/RF07/HU07/P07 context (RNF09/RNF10/RNF12). The field staff audience now
has its own experience at `/staff`: the services the backend already assigned to the authenticated
collaborator, one of them in detail, and — under correction, see the last bullet — the two execution
moves that role carries (`98a6b68`, `d94ed9b` with `1602b82`, `854e4cc`, `6b0a94d`).

- **Audience, not permissions**: `/staff` is the third guarded lazy family, composed exactly like
  `/admin` and `/portal`: one shell with its own navigation, its own `Salir`, and the same audience
  decision in front of it. The decision is the role label the backend returned in the profile
  (`AuthSession.role`) — the customer audience is the backend's `CLIENTE`, the field staff audience is
  its `PERSONAL_CAMPO` label, the seeded role behind `PERSONAL_LEER_PROPIO`, `ORDEN_LEER_ASIGNADA` and
  `ORDEN_ESTADO_ASIGNADA` — and everybody else belongs to `/admin`. No permission, role id or inferred
  user type is consulted, and every redirect target is the home derived from that same label, so the
  three experiences cannot bounce a session between them.
- **Caller scope, not a permission claim**: the backend scopes every assigned-order read through the
  staff record of the session, so the client sends no staff id, claims no assignment and filters
  nothing locally. Only `page`/`size` travel on the list. «Mis servicios» reuses the existing root
  `ServiceOrdersStore` — no second store, no copied result array, no local slicing and no invented
  total — and keeps its documented 30000 ms success-only freshness, shared ref-counted reads, same-key
  stale data, pinned registry and session/SSR fencing. The pages own only their route identity, their
  state feedback and their cancellation.
- **List projection**: supplied code, supplied status text in a badge whose text carries the value,
  supplied property, service type and schedule date with the start/end clock text printed literally.
  Records are a real table above 64rem of available container width and cards below it, both labelled
  `Mis servicios de limpieza`; each row links to its own detail carrying the effective page. Loading,
  `Actualizando servicios…` over verified rows, verified empty, a distinct out-of-range empty state, a
  retryable error that keeps the verified data with a GET-only `Reintentar`, and one fenced
  out-of-range recovery per user action. No filter, KPI or administrative affordance is added.
- **Detail and its two absences**: `/staff/services/:id` prints what the server supplied — id, code,
  customer, property, service type, estimated duration and amount as text, register/update instants as
  the supplied UTC values, the schedule date and clock text, the assigned staff by name and role, and
  the observation as plain text — with `No registrado` for nullable values. The supplied property
  block is filtered by field: access instructions and door codes are dropped from the projection and
  reach neither the template, an accessible name nor an attribute. A `404` for someone else's order
  arrives as the adapter's real `NOT_FOUND` (`requestError` maps `404`), so the page renders a
  definitive absence that replaces any verified record, states the two honest causes and offers no
  retry, because repeating the same GET cannot change the answer; transient failures keep the
  retryable alert. A malformed route id dispatches no read.
- **Paging**: the staff URL publishes `page`/`size`, never `offset`/`limit`, and
  `staff-services-paging.ts` is the only place that translates. Missing, duplicated, malformed,
  fractional, negative, out-of-int32 or above-the-documented-maximum-100 input becomes the first page
  0/20 as a whole pair — nothing is clamped, half-corrected or invented — and a size above the maximum
  is never dispatched. Row and return links serialize the effective returned metadata and refuse
  exactly what the reader refuses, so a link the experience emits is a link it accepts back.
- **The server owns the transitions**: `changeOrderStatus` is wired through
  `PATCH /api/ordenes/{id}/estado` with the closed six-code status and the optional observation
  (maximum 250, trimmed, blank becomes `null`), and the response is decoded as the same order-detail
  shape the detail `GET` already uses — not a flat DTO and not a `204`. That leaves 18 unsupported
  methods in the operations repository. No transition table, role ACL or business clock is encoded in
  Angular: the desired code travels untouched and a refusal is shown inline with project-owned copy.
- **Execution moves (T4, under correction)**: only `Iniciar servicio` (`PROGRAMADA → EN_PROCESO`) and
  `Completar servicio` (`EN_PROCESO → COMPLETADA`) are offered, because the seeded role carries only
  `ORDEN_ESTADO_ASIGNADA`; programar, pagar and cancelar need permissions it lacks and are not
  rendered. The confirmation captures the verified record, takes the optional observation, blocks a
  duplicate submit and every dismissal while pending, keeps a safe inline refusal that preserves the
  confirmation for an explicit retry, and — only on confirmed success of the current generation —
  emits one generic message and forces exactly one fresh read. No optimistic patch, no automatic
  retry and no undo promise. **Accepted rule for a write-side `404`, which the committed candidate
  does not yet implement**: a `NOT_FOUND` from the `PATCH` is an ordinary refusal — the verified
  record stays on screen, the page explains that the service is no longer available for this staff
  member and forces exactly one read — and only when that read itself answers `NOT_FOUND` does the
  definitive absence render, without retry. An independent review rejected the earlier treatment, so
  T4 is documented as pending that fix, not as delivered behaviour.

Pending acceptance: no live backend/CORS run for these slices; no Chrome/Edge/Firefox keyboard or
responsive check of the shell, the list, the detail or the confirmation; no production SSR build
recorded for them; redaction and cross-staff permission are argued from source and adapter codes, not
proven end to end against the real API; and the advisory/refuter native review (RDD) was not executed
for these candidates. The weekly projection was not built because the assigned-order query does not
support it. WP11 is delivered as implementation, not as an accepted package, and no role-aware API
authorization is claimed: the backend remains authoritative on scope, transitions and permissions.
