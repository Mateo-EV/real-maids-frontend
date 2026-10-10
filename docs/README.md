# Product scope and journeys

The Real Maids frontend is a responsive web application for managing cleaning services internally and giving customers a portal to follow their requests and services and contact customer support. This guide preserves the functional plan; it does not certify implemented features. See [the Spanish project overview](../README.md) for onboarding and current status, and [agent instructions](../AGENTS.md) for technical, security and quality rules.

## Current delivery boundary

P01 (M01/RF01/HU01) is a connected frontend demo: login, form validation, safe redirects, session guards and logout with an in-memory source. Auth and guest guards wait for current-user restoration through the use case and store. A user-approved temporary localStorage `authenticated` flag restores the demo session after reload; it is editable client-side, not secure authentication or backend authorization. Server rendering and inaccessible storage fail closed without a demo session. Logout clears the flag when storage is available and clears the loaded store session. Permanent session persistence/refresh remains open. `/admin` loads a reusable protected shell with a child outlet and temporarily redirects to `/admin/users`, not P02. The shell owns brand, shared session identity and logout. Its generated Helm sidebar supports desktop/mobile navigation: IAM is the only enabled link; Landing, CRM, RRHH, Cotizaciones and Programaciones are disabled buttons without destinations (M02/RF02/HU02/P03, RNF06/RNF08/RNF09). Existing users tabs, catalog controls and desktop/mobile records remain feature-owned. The navy header's `Sistema seguro y activo` is requested static copy, not monitored security or backend health. Public build-time configuration supplies `Entorno: Desarrollo` or `Producción` through the production file replacement. The custom Spartan select uses domain `Lang`, defaults to Spanish and permits Spanish/English visual selection only; it neither translates nor persists preferences or mutates the session. Localization/fallback remains open.

M02 (RF02/HU02/P03) now has a protected `/admin/users` visual demo, reachable through IAM in the shared admin shell and the temporary `/admin` redirect. It uses `UserStore` and `RolesStore`, stateless query/CRUD use cases and DI-bound infrastructure repository implementations injecting shared in-memory sources under the `users` feature (RNF09/RNF10). Auth, customers, users and roles use this explicit repository/source boundary. In-memory latency occurs before effects; cancelling before execution prevents writes and ID allocation, not merely result delivery. Each user has one numeric `roleId`, age and nullable `lastAccess`; administrative updates preserve access metadata. Roles have a name, description, active flag and creation date. Deleting any assigned role returns `ROLE_IN_USE`, including assignments to inactive users; deactivation preserves assignments. These are user-approved demo rules, not an ACL or backend contract.

The page provides name/email search, role/status filters, pagination, user creation/editing/deletion confirmation and icon-only record actions with accessible names. For M02/RF02/HU02/P03, the power action replaces the disabled key action on desktop and mobile: Activate/Deactivate opens a confirmation showing the affected name/email and intended status change before mutation. It uses the dedicated `updateUserStatusById(id, isActive)` repository/use-case/store operation, resolving the latest stored profile after cancellable latency and changing only the active flag plus the normal update timestamp. Concurrent profile edits and creation/access metadata are preserved; repeated desired status is safe. Generic profile updates remain available. Pending progress blocks duplicate submission and dismissal; operation errors allow retry, and a success toast appears only after success. Filters and pagination remain in place, with the current page clamped to available results. This is demo profile state, not an ACL, self-deactivation policy or authentication change. Pagination uses the reusable [table controls](../src/app/shared/components/table-pagination/table-pagination.ts) and a [bounded page-token helper](../src/app/shared/pagination/page-tokens.ts): at most seven numeric/ellipsis entries, with first/last pages and a current-page neighborhood. Ellipses are noninteractive; previous/next buttons retain boundary disabled states and the selected page exposes `aria-current`. This is local users-demo navigation (M02/RF02/HU02/P03, RNF06/RNF08/RNF09), not backend pagination or delivery of future table screens. Successful saves/deletions use `HotToastService` notifications instead of the inline success panel; the lazy Users route owns `HotToastService`, `provideHotToastConfig()` and `ViewService`, so inline consumers and body-attached toast containers share the route injector. `angular.json` still includes global `@ngxpert/hot-toast/styles.css` for those overlays. Root repository/store lifetimes and bundle budgets are unchanged (RNF04/RNF09/RNF10/RNF12). There is no role-management launcher or modal; the role catalog/store and user role selector remain. User dialogs close via Cancel, outside click or Escape when idle; all user dismissal and duplicate submission are blocked while an operation is pending (RNF06/RNF12). Component-owned login, user mutations and page catalog queries use DestroyRef cancellation and suppress late feedback after destruction. Users, Sessions, Roles/RBAC and Audit navigation is enabled within the same page; standalone credential management remains absent. The in-memory sources directly own fixtures for five roles and 48 users, with stable matching role IDs and new allocation after the maximum fixture ID. Page entry queries both catalogs concurrently; there is no initializer or sequential create-on-entry flow. Navigation queries do not reseed or replace records; fixtures live for the source instance and can exist in server memory without creating a server auth session. Changes are not durable and reload resets the demo. The [fixture module](../src/app/features/users/presentation/demo/users-demo.fixture.ts) retains fictitious entity bindings, profile IP decoration and the former decorative audit count with integration TODOs; the audit metric now uses the source-backed global log total. Identity/access provenance is marked directly in the in-memory source files. The entity-binding column and mobile card field are commented out, but their fixture data remains; profile IPs are still decorative, not monitored activity. The audit metric counts synthetic source records, independent of viewer filters and pagination; it is not today's activity or a security alert count. Session counts instead come from the simulated session registry. Repetitive future-tab, credential and UTC helper text was removed. Counts of users/roles come from stores. Global navy primary/foreground and enabled-action hover are shared by users, dialogs, login and admin; gold accent and coral decoration remain distinct. Access dates are displayed explicitly in UTC for the mock; the operational timezone remains undecided.

### Retained RBAC and Audit section state

Within Users, RBAC and Audit are created only on their first visit and retained in hidden, inert wrappers when another section is selected. Revisiting does not query again or restart loading: the selected RBAC role and unsaved draft, and Audit filters and page, remain intact. RBAC still waits for successful catalog initialization. Hidden requests can finish; page destruction still cancels component-owned requests. Initial loading, errors and explicit retry remain available. This fixes local navigation continuity (M02/RF02/HU02/P03, RNF06/RNF08/RNF09/RNF10/RNF12), not persistence after leaving the page/reloading, new audit RF/HU, authorization or a performance/budget change. Browser keyboard/responsive acceptance remains pending.

### Shared catalog filter styling

Users, Sessions, RBAC and Audit reuse the stateless opt-in `catalog-filter-row` / `catalog-filter-search` contract in [the global stylesheet](../src/styles.css), preserving the Users reference dimensions and search surface (M02/RF02/HU02/P03, RNF08/RNF09). Future catalog sections can follow [the usage guide](../README.md#filtros-de-catálogo-reutilizables) without copying feature overrides or introducing a wrapper component. Only opted-in rows receive the shared control heights and responsive search widths; labels, actions and bindings remain local, and Helm retains semantic borders/focus rings. Markup tests do not prove computed dimensions; rendered browser acceptance remains pending.

### Active sessions demo registry

M02/RF02/HU02/P03 now connects a separate Sessions section with one native expandable group per catalog user, including zero-session users, and Todos/Con sesiones/Sin sesiones filters. Local case-insensitive, trimmed name/`USR-XXX` ID search combines with the filter before shared TablePagination slices five user rows per page. All catalog users remain reachable, including those without sessions; devices stay together within their user row. Search/filter changes reset the page, catalog/session changes clamp it, and the range summary and clear-results action reflect the combined results. Global active-session counts remain independent of search, filter and page. Details show device, documentation-only IP, start and expiry in UTC without repeated email, role or permission metadata. Source-owned fictitious fixtures use stable catalog IDs with multiple and zero connections, relative start/expiry dates and defensive date copies. UTC is the existing mock display convention, not a decision about the future operational timezone.

Active means expiry strictly later than the current clock. The shared session store excludes expired records; component-owned browser clock updates keep rows, navigation counts and the session metric aligned. Catalog deletion removes the user from the visible registry/count without changing authentication. Individual simulated revoke confirms the affected user/device, prevents pending duplicate submission and Cancel/outside-click/Escape dismissal, supports error retry and only reports success after completion. There is no bulk close-other control. The source also rejects unknown, mismatched or expired session IDs and protects the current designation below the UI. Cancellable latency precedes reads/validation/mutation; destroyed components unsubscribe and suppress late feedback. Query/revoke use stateless execute use cases, typed Results/errors and a distinct token aliased with useExisting to the root repository implementation injecting the root source (RNF09/RNF10).

**The current-session marker is a simulated registry designation, not linked to AuthStore, authenticated identity or browser credentials.** It creates no auth session on client or server and never changes login/logout. This is not backend session management, authorization or security monitoring: there are no endpoints, new permissions or persistence contracts, and reload resets the source. Normal Spanish UI omits development notices; provenance belongs in source and documentation. Browser visual/keyboard/responsive acceptance remains pending independently of unit/build verification (RNF06/RNF08/RNF12).

The user editor collects a password: required on creation by a trimmed-value check, not required by that check on editing, with a declared `minLength` of eight characters in both modes. Passwords are trimmed before submission; blank edit validation is not certified here. The in-memory source explicitly copies only public profile fields, excluding passwords on creation and update; the form does not deliver persisted credential updates or authentication changes. The former disabled standalone credential action has been replaced by the profile-status action; credential management remains absent. The editor validates age as an integer ≥18; this is demo form validation, not a confirmed backend business rule. The demo is not credential management, secure role authorization or HTTP integration. Backend age validation and email uniqueness policy remain unresolved; `EMAIL_ALREADY_EXISTS` is not enforced by the in-memory source. Browser visual/responsive/keyboard checks in Chrome, Edge and Firefox remain pending; unit tests and a build do not certify screenshot fidelity or browser behavior.

M03 has a `customers` domain, five query/CRUD use cases, an in-memory adapter and a presentation store, but no P04 route or UI. It does not deliver customer management/history to users or define backend DTOs, persistence or email uniqueness. All other screens and the customer portal remain planned. Real HTTP authentication/integration, JWT persistence, enforced role authorization, E2E and CI/CD are absent; production deployment is unverified. Existing unit tests are not a claim of a newly verified pass or fixed test count.

### Editable RBAC demo matrix

M02/RF02/HU02/P03 now connects the Roles/RBAC section through stateless query/save use cases, a root store and a distinct repository token aliased with useExisting to the root implementation/source (RNF09/RNF10). The existing five roles remain unchanged. Operations (role 2) starts with exactly 19 reference grants across seven illustrated rows; the other four roles start unconfigured, with no grants, and can be edited. The design's 14 functional labels and seven illustrated rows are not product M01–M12 identifiers or a confirmed backend ACL. Scope/rule annotations remain display-only text, unaffected by checkbox changes.

The responsive header groups title, role selection and Save using the shared catalog filter dimensions and navy primary theme. Desktop action columns retain R/C/U/D and Export/Sync labels; mobile module fieldsets expose equivalent labeled Signal Forms choices. Switching roles discards unsaved changes only on successful loading; stale responses cannot replace the selected draft. Save confirms the affected role and changes, prevents pending dismissal/duplicates, supports retry and reports success only after completion. These are in-memory edits, not request authorization. No role CRUD launcher/modal, authentication changes, real ACL or durable persistence is delivered. Reload resets matrices. RNF06/RNF08/RNF12 guide navigation, responsive controls and feedback; browser acceptance remains pending.

### Read-only audit viewer and CSV demo

Audit-specific RF/HU traceability is still missing from the inherited product plan. M02/RF02/HU02/P03 provides users-administration context, not new audit requirements; RNF06/RNF08/RNF09/RNF10/RNF12 guides navigation, responsive feedback and layering. The connected Audit section has a root SignalStore, read/detail/export use cases and an audit repository token aliased with useExisting to the root implementation injecting the root source.

The source owns 48 synthetic logs; these are not automatic records of user CRUD, permission edits or monitored activity. UTC-day, entity and action filters combine before pagination; results order by date descending then ID descending, with total computed before slicing and defensive entity/date/change copies after cancellable 250 ms latency. Shared plain TypeScript offset pagination still defaults to offset 0 and limit 20 (maximum 100), returning `{ items, total, offset, limit }`; the viewer requests five per page. Invalid runtime values produce typed failure Results; only omitted values receive defaults. Other features are not migrated to shared offset pagination. The global audit metric is independent of filters and page.

Desktop rows and mobile event cards show actor, UTC timestamp, action, entity, record ID and IP/origin. The selected record opens its own detail; before/after changes appear only when that record supplies them. Loading, empty, retryable query/export errors and pending export controls remain explicit. CSV exports all filtered results, not only the visible page, with quote/newline escaping and spreadsheet-formula guarding. The download adapter guards browser-only APIs for SSR, cleans up its object URL and reports success only after browser initiation, not confirmation that a file was saved.

This delivers a read-only demo UI/store/detail/export, not audit writes, a separate route, HTTP integration, durable persistence, security monitoring, immutability or actual hash/integrity verification. Navy primary actions and UTC deliberately remain instead of the screenshot's coral Save and UTC-5. Screenshot comparison and markup tests do not establish rendered fidelity; Chrome/Edge/Firefox visual, responsive, keyboard and actual download acceptance remain unrun.

## People and navigation

Planned actors are administrators, administrative staff, field staff and customers. A “boss” or otherwise authorized supervisory profile appears in the plan, but its relation to formal roles and permissions is unresolved; do not equate it with administrator.

Planned entry views are P02 for administrators, P06 for administrative staff, P09 for field staff and P11 for customers. These are not an ACL or implemented redirects. Actual permissions must be confirmed with the backend.

## Planned modules and useful identifiers

RF denotes functional requirements, RNF non-functional requirements, HU user stories, M modules and P screens from the functional source, `Avance_1.pdf`. These identifiers express intent, not Angular modules or delivery progress. The inherited text says eleven modules but enumerates M01–M12; preserve the twelve listed IDs. Modules, requirements and screens do not map one-to-one.

- **M01 — Authentication:** RF01/HU01, P01 login; real backend access remains to be integrated.
- **M02 — Users, roles and permissions:** RF02/HU02, P03 administration; no definitive permission matrix yet.
- **M03 — Customers and history:** RF03/HU03 for customer management and RF12/HU12 for history, both associated with P04.
- **M04 — Service requests:** RF04/HU04, P05 internal requests. The customer portal also spans M04/M05 through RF15/HU15 and P11.
- **M05 — Service orders and assigned services:** RF05–RF06/HU05–HU06, P06 orders; RF10/HU10, P09 field staff's assigned services.
- **M06 — Field staff:** RF07/HU07, P07 staff management.
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

Open “My requests and services” (P11), inspect details and follow progress, then access customer support (P10) when needed. Direct creation of a service request by a customer is unresolved and must not be assumed from the portal's name.

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
- Backend session/JWT initialization, expiration, persistence and refresh; implications for SSR/private-route render modes.
- Generated versus manual API client, caching and retry policy, frontend observability and data policy.
- Spanish/English localization and fallback, operational timezone/formatting, browser/performance acceptance measurements, E2E tooling and production hosting.

Resolve these with explicit product/technical decisions and actual backend evidence. Update this guide when a route, consumer or integration changes delivery status; keep the useful identifiers without expanding this into a duplicate implementation matrix.
