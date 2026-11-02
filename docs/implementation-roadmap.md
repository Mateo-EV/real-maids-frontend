# Implementation roadmap: official product, reference-inspired workflows

Prioritize a usable customer-management slice, then build the internal service journey and audience-specific experiences. Adapt useful reference interactions to **our official model and existing visual structure**. This is a proposed execution plan, not implementation authorization, a delivery guarantee or evidence that planned features work.

## Quick path and authority

1. Confirm readiness and visual boundaries (WP1).
2. Deliver customer list, editing and property detail in small verified slices (WP2–WP4).
3. Add relations/history and acquisition, then connect manual operations (WP5–WP7).
4. Prioritize support, oversight and portals against actual contracts (WP8–WP11).
5. Approve advanced capabilities separately (WP12); do not import reference rules implicitly.

The [product guide](README.md) owns M/RF/HU/P intent and business states; [agent instructions](../AGENTS.md) own engineering constraints. The official data model and actual backend contracts remain authoritative. Approved Figma designs, where supplied, establish visual acceptance; the comparison application does not.

Preserve the admin shell, sidebar/navigation structure, page hierarchy, responsive patterns, navy primary actions, gold accents, coral decoration and Plus Jakarta Sans. Reuse [global theme contracts](../src/styles.css), Spartan Brain/Helm and Tailwind, not copied reference CSS or a new design system. Enable navigation only when its scoped consumer is ready; this plan does not activate placeholder entries.

Reference fields and schema are not migration instructions. Small differences should be mapped or omitted explicitly, not treated automatically as blockers. Escalate structural conflicts and missing business semantics, rather than redesigning the official model to match screenshots. In particular, official `areaM2` stays canonical; reference `areaFt2` does not authorize a unit change.

## Evidence-based starting point

| Area | Source-confirmed baseline | Remaining boundary |
| --- | --- | --- |
| Navigation/auth | [App routes](../src/app/app.routes.ts), [auth routes](../src/app/features/auth/auth.routes.ts) and [admin routes](../src/app/experiences/admin/admin.routes.ts) expose `/login`, protected `/admin`, `/admin/users` and `/admin/customers`. | `/admin` temporarily redirects to users, not dashboard P02. Guards are not a role-navigation ACL. |
| IAM | [Users route](../src/app/features/users/users.routes.ts) hosts user/RBAC/session/audit UI with HTTP integration, as detailed in the product guide. | Live authenticated backend/CORS, multi-tab auth and browser acceptance remain pending; the shell's demo notice is not integration proof. |
| Customer capability | [Customers boundary](../src/app/features/customers/README.md) has HTTP sources, stateless actions and root stores for customers, properties, relations, acquisition and history. | Read-only P04 list is connected at `/admin/customers` (WP1–WP2 implementation slice); WP3 connects create/edit/deactivate; WP3 manual/live/browser and database concurrency acceptance, plus WP4 detail/properties remain pending. |
| Other capabilities | [Domain foundations](README.md#domain-foundations-by-backend-area) cover the remaining backend areas. Their READMEs distinguish source-confirmed backend operations from proposals. | Domain entities/contracts do not establish frontend HTTP adapters, stores, routes or delivered screens. |
| Visual navigation | [Sidebar](../src/app/experiences/admin/presentation/components/admin-sidebar/admin-sidebar.ts) enables IAM and **CRM**; CRM keeps its exact label, placement/icon/style and opens `/admin/customers`. Landing, RRHH, Cotizaciones and Programaciones remain disabled. | Keep the existing layout; do not imply these buttons already open features. |

Reference observations supplied for this plan came from static routes/templates/API code and Flyway V1–V7 in the separate comparison project. They suggest workflows, not browser-tested behavior, approved contracts or official acceptance criteria. The WP1–WP2 implementation handoff records observed Angular test/build results; this roadmap does not equate them with live/backend or browser acceptance.

## Bounded WP1–WP2 implementation evidence

The approved first slice connects only the read-only customer list, not the full presentation journey or completed roadmap. Existing contract evidence is documented in the [customer boundary](../src/app/features/customers/README.md#customer-page-contract-s2s4): active-only `GET /api/clientes`, initial 0/20, server name/ID ordering and actual effective metadata. Official name/type/email/phone map directly to responsive table/cards; no reference fields, filters, ACL, counters or writes were imported. Backend authorization remains authoritative (`CLIENTE_LEER`); no role inference was added.

Loading, verified empty, failed/retry and same-query stale states reuse existing Helm/theme patterns. The page selects the root query entry and owns cancelable observation subscriptions, with one bounded positive-total out-of-range correction retaining effective size. Response metadata is never locally rewritten. New navigation/retry resets the correction allowance, not every response. WP3 now connects editing using loaded record context; detail/property launchers stay deferred to WP4. WP2's broader detail-selection deliverable is not claimed.

The exact visible sidebar label is **CRM**, not Clientes/Customers, with original General placement/icon/style. `/admin` still redirects to users and IAM behavior remains unchanged. Deterministic Angular page/store-contract/router/sidebar tests and configured suite/build are recorded in the handoff. Protected credential input, live authenticated requests/CORS/permission-denial acceptance and rendered Chrome/Edge/Firefox responsive/keyboard checks remain unavailable/pending; WP1/WP2 exits and the shared checklist are not marked complete.

Current demonstration script: IAM → CRM → inspect active customer fields and actual range → next/previous → return to IAM. Verify loading/empty/error/stale retry with authorized non-sensitive records and record actual environment/evidence. WP3 now adds create/edit/deactivate launchers as documented below; detail/property steps remain future targets.

## Recommended next-week presentation target

**A presentation target, not a guaranteed date or a requirement to finish this entire roadmap next week.** Favor one coherent customer journey over many disconnected screens.

- Show existing IAM with an explicit distinction between source-connected HTTP functionality and still-pending live acceptance. Do not call the IAM demo a newly accepted backend release.
- Target WP2–WP4: server-paged active customers, create/edit, selected customer detail and properties, using our shell and theme.
- Verify that journey against the actual backend and in browsers before calling it functional. Record errors, permissions, responsive behavior and keyboard evidence, not just screenshots.
- Add contacts/preferences/history only if the core journey is validated; otherwise mark WP5 explicitly pending. Leads and downstream operations remain later slices unless separately prioritized.
- A clearly labeled prototype may explain visual intent if integration is blocked. It is not integrated functionality or evidence of backend completion.

The presentation script should identify the environment and evidence boundary, navigate IAM → customers → create/edit → detail/property → return to the server page, and distinguish completed checks from pending ones. Use authorized non-sensitive demonstration records; never put credentials or door codes in screenshots or logs. No invented metrics or completion percentages.

## Numbered work packages

Every package exits only when its own evidence and the shared completion checklist are satisfied. A missing contract blocks that capability, not unrelated ready work. WP identifiers below are planning labels, not new RF/HU identifiers.

### WP1 — Establish readiness and preserve boundaries

- **Goal:** agree the first executable slice without changing the official product or visual system.
- **Dependencies/readiness:** current backend OpenAPI/controller/DTO evidence, approved API origin/CORS, protected credential-input channel and an authorized test identity; existing shell/theme available.
- **Deliverables:** contract/permission checklist, field mapping, loading/error sketches in our layout, demonstration script and a list of unresolved differences. Confirm customer pagination contract `f7988fb` or newer.
- **Acceptance/evidence:** record supported operations, errors, page metadata, dates, permission denials and safe environment access. Compare proposed screens with the current shell/theme; do not copy reference schema/CSS.
- **Traceability:** M01/RF01/HU01/P01, M02/RF02/HU02/P03; RNF01/RNF03/RNF06–RNF10/RNF12.
- **Exit:** a bounded customer-list implementation scope is approved; missing live access remains explicitly pending, never replaced by demo fallback.

### WP2 — Customer server-paged list

- **Goal:** make the existing customer read boundary reachable as P04.
- **Dependencies/readiness:** WP1; existing CustomersStore, list use case and active-only backend page contract.
- **Deliverables:** lazy customer page and intentional CRM navigation entry, responsive records, shared pagination and customer selection. Do not invent search/filter endpoints, tags or an inactive catalog.
- **Acceptance/evidence:** adopt returned total/offset/effective limit and stable name/ID ordering; never download a complete catalog for slicing. Exercise empty, failed, stale refresh, retry, cancellation and bounded out-of-range recovery without cross-query rows.
- **Traceability:** M03/RF03/HU03/P04; RNF06–RNF10/RNF12.
- **Exit:** backend-backed paging and navigation are tested and browser-verified; a rendered mock list alone does not pass.

### WP3 — Create, edit and desired activation state

- **Goal:** manage official customer profiles without physical deletion.
- **Dependencies/readiness:** WP2; documented create/update/status operations and actual permissions.
- **Deliverables:** Signal Forms for name/type/email/phone, contextual confirmations, pending guards and safe typed errors. Display server metadata rather than adding invented write fields.
- **Acceptance/evidence:** preserve nullable replacement semantics, report only confirmed writes and refresh/invalidate server pages without guessing membership/totals. Deactivation can remove a row from the active-only listing; it must not become an inactive-search feature.
- **Traceability:** M03/RF03/HU03/P04; RNF01/RNF08–RNF10/RNF12.
- **Exit:** create/edit/deactivate are verified with backend and browser evidence. Reactivation is offered only for an authorized, legitimately loaded inactive detail; otherwise its discoverability remains pending, not solved by a new endpoint.

#### Bounded WP3 delivery and evidence boundary

The user authorized continuing after reporting WP2 manual acceptance: “ya lo comprobé y está correcto, continuemos con lo que sigue”. Preserve that reported acceptance; it does not establish exhaustive agent-observed browser/CORS checks. This task authorizes WP3 only, not the rest of the roadmap.

Connected at CRM: Crear cliente, labeled Editar/Desactivar on desktop and mobile; Signal Forms name/type/email/phone, trimmed text, explicit null optional replacements, declarative limits/contact validation; selected-customer desired-false confirmation; guarded pending Cancel/Escape/outside dismissal and duplicate prevention. Actionable inline failure alerts retain drafts; only confirmed Result success produces an owner/session-fenced success toast. Users and CRM consume shared `CatalogFrame` for hierarchy, header/actions, responsive table/cards (64rem container breakpoint) and footer. Users navigation/KPIs stay outside and filters remain feature-owned; CRM invents neither filters nor KPIs. Both lazy routes use shared `provideCatalogToast()`, each owning HotToastService, ViewService and config together; global CSS in `angular.json` stays unchanged, with no root provider movement, root feedback consumer or direct Users-feature import. Model/API/store/session behavior and the exact CRM label remain unchanged. The reference guides functionality/content, not visual authority. No role-name ACL, delete, detail/properties, search/tags, inactive catalog or reactivation launcher.

Existing store observers own one post-write refresh; the page never changes server rows/totals optimistically or duplicates reloads. Page/dialog subscriptions cancel on destruction/session end, fence stale completions and preserve same-session renewal; cancellation cannot undo dispatched server effects. Deterministic DOM/store-contract tests retain WP2 paging/recovery coverage and exercise WP3 mapping, validation, errors, pending dismissal and lifecycle fencing. Exact focused/full test and build evidence belongs to the implementation handoff, not an assumed pass here.

Repeatable WP3 acceptance: IAM → CRM → create with invalid/valid fields → inspect confirmed success toast and server refresh → edit a loaded customer with blank contacts → confirm deactivation of that named customer → inspect active-only refresh → IAM. Use authorized non-sensitive records. Corrected WP3 visual/manual/live/backend and rendered browser/keyboard/responsive acceptance remain pending. WP4 and advanced gates remain unapproved; the shared checklist is intentionally not marked complete.

### WP4 — Customer detail and properties

- **Goal:** retain useful customer context and manage official property data.
- **Dependencies/readiness:** WP2–WP3; documented owner-scoped property operations and permission boundaries.
- **Deliverables:** customer detail, property list/create/edit/status actions and return-to-list context, adapted to our responsive visual structure.
- **Acceptance/evidence:** validate selected/owner identities, include inactive properties as documented, preserve `areaM2` decimal bounds and show server fields only. Authorized access instructions/door codes must not leak through logs, audit decoration or broader portal exposure.
- **Traceability:** M03/RF03/HU03/P04; RNF01/RNF08–RNF10/RNF12.
- **Exit:** verified customer/property journey completes the core presentation target; missing sensitive-field or browser checks stay pending.

### WP5 — Contacts, preferences and official history

- **Goal:** enrich a validated core without inventing a communications timeline.
- **Dependencies/readiness:** WP4; existing relations/history stores and module-specific history permissions.
- **Deliverables:** scoped contact/preference forms and a history view separating recent service requests, orders and support, with each returned module total/restriction.
- **Acceptance/evidence:** distinguish customer-wide preferences from property-scoped ones; preserve inactive entries and redacted/null history values. No aggregate activity total, synthetic events or false empty results on denied/failed modules.
- **Traceability:** M03/RF03/HU03 and RF12/HU12/P04; RNF01/RNF08–RNF10/RNF12.
- **Exit:** relations/history verified independently. Notes, emails, calls, tags and SMTP are not delivered by this package and need WP12 decisions.

### WP6 — Lead inbox, follow-ups and conversion

- **Goal:** expose the existing acquisition boundary as a coherent administrative workflow.
- **Dependencies/readiness:** customer creation/detail accepted; documented acquisition permissions, paged leads and origin/stage catalogs.
- **Deliverables:** lead inbox/detail/editor, append follow-ups, permitted origin/stage selection and contextual conversion confirmation.
- **Acceptance/evidence:** use Angular `Lead`/`leadId` while retaining Spanish prospect wire names. Conversion sends only ID/type, uses current server data and repeated conversion returns the linked customer; no automatic account, email merge or inferred stage change. Follow-ups do not implicitly change stage.
- **Traceability:** M03/RF03/HU03 supplies customer context; dedicated acquisition/public-quote RF/HU is missing and must be recorded before implementation; RNF09/RNF10/RNF12.
- **Exit:** backend/browser evidence covers normal, repeated, forbidden and failed conversion. Public quote generation remains separately gated.

### WP7 — Manual internal service journey and calendar

- **Goal:** connect internal request → order → manual scheduling/assignment, not an automatic scheduling engine.
- **Dependencies/readiness:** accepted customer/property selection; inspect [operations](../src/app/features/operations/README.md), [field operations](../src/app/features/field-operations/README.md) and [service catalog](../src/app/features/service-catalog/README.md) contracts before adapters.
- **Deliverables, ordered slices:** integrate active service types and staff/profile/availability first; then internal request list/detail/create/update/cancel, order creation/detail and manual schedule/re-schedule/team replacement. Add day/week/month calendar projections and an order-detail interaction within our layout.
- **Staff/catalog gate:** staff readiness precedes assignments. Crew membership endpoints are still proposals: use confirmed staff/team assignment operations without fabricating crew IDs, and defer crew management until contracted. Catalog integration must be ready before any pricing flow; rate/package administration is not established by active service-type reads.
- **Acceptance/evidence:** verify actual date-range/staff filters, agenda response, team replacement including empty lists and server conflict/errors. Reference crew/package/type filters need separate contract confirmation. No drag move or recurring block operation may imply an unsupported write.
- **Traceability:** M04/RF04/HU04/P05; M05/RF05–RF06/HU05–HU06/P06; M06/RF07/HU07/P07; M07/RF08/HU08 and M08/RF09/HU09/P08.
- **Exit:** one authorized manual request-to-assignment journey is verified end to end; uncontracted crews, pricing, recurrence and conflict automation remain pending.

### WP8 — Customer support, separate from service requests

- **Goal:** provide the official customer-attention workflow, not another order/request editor.
- **Dependencies/readiness:** confirmed customer/order context and [support contracts](../src/app/features/customer-support/README.md); ownership/redaction rules before portal exposure. Can proceed independently of full calendar delivery when contracts permit.
- **Deliverables:** support list/detail, create, follow-up message and permitted state changes with record context.
- **Acceptance/evidence:** preserve `Recibida → En revisión → Resuelta → Cerrada`, caller-relative fields and author redaction. Test denied ownership, response requirements, pending states and retryable errors without replaying writes.
- **Traceability:** M09/RF11/HU11/P10; RF12/HU12 history context; RNF01/RNF08–RNF10/RNF12.
- **Exit:** accepted support journey; complaint photos/uploads and surveys remain separate until their contracts and approval exist.

### WP9 — Dashboard and reports

- **Goal:** show verified oversight rather than decorative reference metrics or client-calculated finances.
- **Dependencies/readiness:** [reports/dashboard contracts](../src/app/features/reports-settings/README.md), permissions, lossless amounts/counts and agreed period semantics. Product priority may place this before or after portal work; it does not require every prior UI.
- **Deliverables:** real P02 dashboard, scoped period reports/history and raw backend CSV, with loading/error/zero distinctions. Replace the temporary entry redirect only under an approved navigation decision.
- **Acceptance/evidence:** server global totals are not current-page counts; charts preserve response meaning. Verify CSV/headers/download behavior and generation side effects; do not automatically replay report generation merely because its transport is GET.
- **Traceability:** M10/RF13/HU13/P12 and M11/RF14/HU14/P02; RNF01/RNF04/RNF07–RNF10/RNF12.
- **Exit:** backend/browser-verified oversight with no invented profitability, payroll, split or closing rules.

### WP10 — Customer portal

- **Goal:** let authenticated customers inspect their own requests/services and access support.
- **Dependencies/readiness:** actual account linkage, ownership/ACL, own-data projections and customer auth entry decisions; prioritize against WP9/WP11 rather than assuming a hard sequence.
- **Deliverables:** own request/service list/detail and support entry within an approved customer experience reusing the official design language.
- **Acceptance/evidence:** prove cross-customer denial and redaction through backend plus browser checks. No direct request creation, reschedule/cancel policy, invitation/activation or password-recovery flow is inferred from the reference.
- **Traceability:** RF15/HU15/P11 spanning M04/M05; M09/RF11/HU11/P10; M01/RF01/HU01/P01.
- **Exit:** accepted own-data journey. Invitation/recovery and self-service mutations require their explicit WP12 gates.

### WP11 — Field staff experience

- **Goal:** offer mobile-readable assigned services and allowed execution actions.
- **Dependencies/readiness:** staff/account readiness from WP7, real own-assignment queries, state permissions and execution contracts; independent prioritization once these dependencies exist.
- **Deliverables:** P09 assigned-service cards, detail and documented status updates; weekly projection only where the actual query supports it.
- **Acceptance/evidence:** verify own-work authorization, responsive/keyboard behavior and allowed/rejected transitions. Work logs/checklists/evidence are domain proposals, not available integrations; absences/time-off approval is not equivalent to weekly availability replacement.
- **Traceability:** M05/RF10/HU10/P09; M06/RF07/HU07/P07 and M07/RF08/HU08 context; RNF01/RNF07–RNF10/RNF12.
- **Exit:** accepted assigned-service journey, with time-off, photos and uncontracted execution actions explicitly pending.

### WP12 — Separately gated advanced capabilities

- **Goal:** evaluate high-value reference ideas without silently expanding official scope.
- **Dependencies/readiness:** explicit product approval, source-confirmed backend contracts, permissions, security and traceability for each selected capability; see the decision gates below.
- **Deliverables:** separately scoped proposals for public quote/pricing, recurrence/automation, communications/tags, invitations/recovery, absence/photos, financial workflows and localization; retain official billing/QuickBooks planning.
- **Acceptance/evidence:** each approved slice gets its own tests, backend/browser evidence and exit checklist. Do not bundle uncertain features into acceptance of the core journey.
- **Traceability:** use existing context IDs only; missing dedicated RF/HU must be recorded, not invented. QuickBooks retains M12/RF16–RF17/HU16–HU17/P13 and RNF13–RNF14.
- **Exit:** each capability is independently accepted or explicitly deferred; this document approves none of the new business rules.

## Reference coverage → official equivalent

“Pending UI” means supporting frontend boundaries exist, not accepted functionality. “Domain only” means integration still needs implementation; “gated” means approval/contracts are unresolved.

| Reference feature | Official equivalent / adaptation | Package | Status / dependency |
| --- | --- | --- | --- |
| CRM list/editor | Active-only customer pages/profile/status | WP2–WP3 | List plus WP3 create/edit/deactivate source-connected; WP2 acceptance user-reported, WP3 manual/live/browser acceptance and WP4 detail pending. No tags/inactive search inferred. |
| Customer properties | Official owner-scoped property model, `areaM2` | WP4 | Pending UI; retain sensitive-field permissions. |
| Notes/email/call timeline | Official requests/orders/support history, not the same timeline | WP5 / WP12 | History pending UI; communications/tags need scope/contracts and missing traceability. |
| Lead inbox/conversion | Lead pages, follow-ups and atomic customer linkage | WP6 | Pending UI; dedicated acquisition RF/HU missing. |
| Public quote | Quote/web-form/catalog foundations, not a ready public pricing API | WP12 | Gated; public-quote/landing RF/HU missing. |
| Day/week/month agenda | Official manual schedule/team assignment and date-range agenda | WP7 | Domain only; crew/package/type filters require actual support. |
| Recurring customer schedule/block moves | Contracts/frequencies/schedules as foundations, not recurrence logic | WP12 | Gated automation, conflicts and mutation semantics. |
| Crews/members/absences | Official staff/availability, proposed crews/execution | WP7 / WP11 / WP12 | Domain only; crew APIs and absence approval missing. |
| Customer portal invitations | Own services/support; account linkage is not invitation delivery | WP10 / WP12 | Planned; invitation/activation/recovery contracts required. |
| Specialist portal | Official field staff assigned-services experience | WP11 | Planned; do not adopt reference role names or permissions. |
| Complaints/photos | Official support flow; separate evidence/upload capability | WP8 / WP12 | Support domain only; photo transport/security unconfirmed. |
| Dashboard/profit split | Official dashboard/reports; no inferred financial calculation | WP9 / WP12 | Domain only; payroll/splits/closing separately gated. |
| Spanish/English | Existing visual language select, not translation | WP12 | i18n/fallback/timezone decisions pending. |
| Reference excludes QuickBooks/group F | Official billing foundation and backend-only accounting integration remain | WP12 | [Billing](../src/app/features/billing/README.md) is proposed; [QuickBooks](../src/app/features/quickbooks/README.md) is planned official scope. |

## Explicit decision and contract gates

| Gate | Evidence/approval required before implementation |
| --- | --- |
| Automatic scheduling/recurrence | Ownership, conflict detection, availability, series/exception/block-move semantics, concurrency and server validation; manual scheduling acceptance is not approval for automation. |
| Public quote/pricing/unit conversion | Public-safe API, anti-abuse/PII policy, catalog/rate readiness, server-owned totals and rounding, quote lifecycle and approved display/input conversion. Preserve canonical m²; do not import reference rates or fixed package codes. |
| SMTP/tags/extended timeline | Approved business purpose/model and dedicated traceability, server delivery/consent/audit rules and safe API. [Communications](../src/app/features/communications/README.md) and [web content](../src/app/features/web-content/README.md) are foundations, not sending/public-form implementations. |
| Invitations/password recovery | Account lifecycle, token expiry/single use, delivery, enumeration resistance and public route/auth contracts. Linking a customer account is not an invitation system. |
| Absence approval/photos | Staff approval states/permissions; upload limits/types, storage/access, consent, retention and evidence ownership. Weekly availability is not a time-off approval workflow. |
| Payroll/revenue share/financial closing | Approved financial model, precision, taxes, authorization, audit and backend-owned calculations/closing/reversal contracts. No reference financial rules are inherited. |
| i18n/timezone | Library, language/fallback, persistence and session implications, operational timezone, DST/date boundaries and formatting decisions. Do not adopt Florida or any timezone by assumption. |
| Exceptional transitions/destructive visit deletion | Explicit allowed source/target states, cancellation/reopening semantics, authorization, history and concurrency. No reference 48-hour rule or destructive visit delete is authorized. |

Official normal order states remain `Pendiente → Programada → En proceso → Completada → Pagado`; cancellation is an alternative exit whose source states remain unresolved. Official support states remain separate. Do not infer exceptional transitions, role names, rates or financial rules from the reference. QuickBooks OAuth, credentials, reconciliation and idempotency stay backend-only; Angular consumes approved internal APIs, never Intuit directly.

## Shared definition of done for future implementation

- [ ] Confirm current backend source/OpenAPI, official fields, DTOs/errors, pagination/filtering and real permission/ownership boundaries; record discrepancies instead of inventing endpoints or missing values.
- [ ] Retain feature-owned SignalStores, stateless `*UseCase.execute()`, repository implementations injecting HTTP sources and composition-root bindings. No framework, forms, state or architecture replacement.
- [ ] Reuse session fencing, consumer-owned cancellation and approved read TTL patterns: customer/detail/property/contact/preference/catalog 120000ms; lead/follow-up/history 30000ms. Only successful reads renew freshness; no polling, uncancelled root consumers or stale cross-session results.
- [ ] Preserve SSR/hydration safety, browser guards and no sensitive transfer-cache data. Never infer authorization from roles/cached data; no demo fallback, automatic write retries or credential exposure.
- [ ] Show loading/empty/error/stale/retry independently; retain verified same-key data during refresh, never unrelated rows. Confirm actual mutations, prevent duplicates and expose partial failures without promising cancellation rollback.
- [ ] Preserve our shell/theme, Signal Forms, accessible labels/focus/keyboard and desktop/tablet/mobile hierarchy. Verify recent Chrome, Edge and Firefox; missing browser/live proof remains pending.
- [ ] When implementing code, add deterministic tests through the official Angular Vitest target for mapping, validation, permissions/denials, cancellation, session changes and UI actions/states; compile the affected application/SSR paths. Record exact commands/results; missing tests are not a pass. E2E tooling needs a separate decision.
- [ ] Run workspace-local Prettier on touched files before final checks, preserve budgets and report link/diff checks for docs. Update implemented/planned distinctions and existing RF/RNF/HU/M/P traces with a repeatable demo script and non-sensitive evidence.

## Open decisions and first executable future step

Open decisions are the final backend permission matrix/navigation, protected live acceptance access, approved customer-screen visual references, prioritization of oversight versus portals, dedicated acquisition/public-quote/tags/communications/billing traceability, direct customer request creation and every advanced gate above. Production HTTPS/hosting, permanent credential transport, i18n/timezone and E2E tooling remain unresolved, not chosen by this roadmap.

**Next acceptance action:** verify WP3 create/edit/deactivate against the actual backend and in browsers once protected live access is available, preserving user-reported WP2 acceptance and the original visual shell/theme. Keep missing evidence pending, not replaced by fixtures or unit/build results. Scope WP4 separately before adding detail/property launchers.

Writing this roadmap authorizes documentation only. It neither authorizes implementation of every reference capability nor changes the official model, scope, visual structure or business rules.
