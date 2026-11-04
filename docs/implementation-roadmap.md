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
| Customer capability | [Customers boundary](../src/app/features/customers/README.md) has HTTP sources, stateless actions and root stores for customers, properties, relations, acquisition and history. | Read-only P04 list is connected at `/admin/customers` (WP1–WP2 implementation slice); WP3 connects create/edit/deactivate; Corrected WP3 visual/manual/live/browser acceptance is user-reported, not exhaustive agent-observed proof. Three bounded WP4 slices (detail/properties, property create/edit and desired-status confirmation) are source-connected; full WP4, live/browser/security and database concurrency acceptance remain pending. |
| Other capabilities | [Domain foundations](README.md#domain-foundations-by-backend-area) cover the remaining backend areas. Their READMEs distinguish source-confirmed backend operations from proposals. | Domain entities/contracts do not establish frontend HTTP adapters, stores, routes or delivered screens. |
| Visual navigation | [Sidebar](../src/app/experiences/admin/presentation/components/admin-sidebar/admin-sidebar.ts) enables IAM and **CRM**; CRM keeps its exact label, placement/icon/style and opens `/admin/customers`. Landing, RRHH, Cotizaciones and Programaciones remain disabled. | Keep the existing layout; do not imply these buttons already open features. |

Reference observations supplied for this plan came from static routes/templates/API code and Flyway V1–V7 in the separate comparison project. They suggest workflows, not browser-tested behavior, approved contracts or official acceptance criteria. The WP1–WP2 implementation handoff records observed Angular test/build results; this roadmap does not equate them with live/backend or browser acceptance.

## Bounded WP1–WP2 implementation evidence

The approved first slice connects only the read-only customer list, not the full presentation journey or completed roadmap. Existing contract evidence is documented in the [customer boundary](../src/app/features/customers/README.md#customer-page-contract-s2s4): active-only `GET /api/clientes`, initial 0/20, server name/ID ordering and actual effective metadata. Official name/type/email/phone map directly to responsive table/cards; no reference fields, filters, ACL, counters or writes were imported. Backend authorization remains authoritative (`CLIENTE_LEER`); no role inference was added.

Loading, verified empty, failed/retry and same-query stale states reuse existing Helm/theme patterns. The page selects the root query entry and owns cancelable observation subscriptions, with one bounded positive-total out-of-range correction retaining effective size. Response metadata is never locally rewritten. New navigation/retry resets the correction allowance, not every response. WP3 now connects editing using loaded record context; the first read-only WP4 slice now connects detail/property launchers. WP2's broader detail-selection deliverable is not claimed.

The exact visible sidebar label is **CRM**, not Clientes/Customers, with original General placement/icon/style. `/admin` still redirects to users and IAM behavior remains unchanged. Deterministic Angular page/store-contract/router/sidebar tests and configured suite/build are recorded in the handoff. Protected credential input, live authenticated requests/CORS/permission-denial acceptance and rendered Chrome/Edge/Firefox responsive/keyboard checks remain unavailable/pending; WP1/WP2 exits and the shared checklist are not marked complete.

Current demonstration script: IAM → CRM → inspect active customer fields and actual range → next/previous → return to IAM. Verify loading/empty/error/stale retry with authorized non-sensitive records and record actual environment/evidence. WP3 now adds create/edit/deactivate launchers as documented below; read-only detail/property steps are now source-connected in the first WP4 slice below.

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

The user authorized continuing after reporting WP2 manual acceptance: “ya lo comprobé y está correcto, continuemos con lo que sigue”. Preserve that reported acceptance; it does not establish exhaustive agent-observed browser/CORS checks. That authorization covered WP3 only, not the rest of the roadmap. The later explicit user resume authorized the first bounded read-only WP4 slice below. The subsequent instruction to review the delivered output and continue authorized the second bounded property create/edit slice. The later continuation below authorizes the third desired-status slice only, not all property actions.

Connected at CRM: Crear cliente, labeled Editar/Desactivar on desktop and mobile; Signal Forms name/type/email/phone, trimmed text, explicit null optional replacements, declarative limits/contact validation; selected-customer desired-false confirmation; guarded pending Cancel/Escape/outside dismissal and duplicate prevention. Actionable inline failure alerts retain drafts; only confirmed Result success produces an owner/session-fenced success toast. Users and CRM consume shared `CatalogFrame` for hierarchy, header/actions, responsive table/cards (64rem container breakpoint) and footer. Users navigation/KPIs stay outside and filters remain feature-owned; CRM invents neither filters nor KPIs. Both lazy routes use shared `provideCatalogToast()`, each owning HotToastService, ViewService and config together; global CSS in `angular.json` stays unchanged, with no root provider movement, root feedback consumer or direct Users-feature import. Model/API/store/session behavior and the exact CRM label remain unchanged. The reference guides functionality/content, not visual authority. No role-name ACL, delete, search/tags, inactive catalog or reactivation launcher. Read-only detail/properties are now added by the separately resumed WP4 slice below.

Existing store observers own one post-write refresh; the page never changes server rows/totals optimistically or duplicates reloads. Page/dialog subscriptions cancel on destruction/session end, fence stale completions and preserve same-session renewal; cancellation cannot undo dispatched server effects. Deterministic DOM/store-contract tests retain WP2 paging/recovery coverage and exercise WP3 mapping, validation, errors, pending dismissal and lifecycle fencing. Exact focused/full test and build evidence belongs to the implementation handoff, not an assumed pass here.

Repeatable WP3 acceptance: IAM → CRM → create with invalid/valid fields → inspect confirmed success toast and server refresh → edit a loaded customer with blank contacts → confirm deactivation of that named customer → inspect active-only refresh → IAM. Use authorized non-sensitive records. The user subsequently reported corrected WP3 visual/manual/live/backend and rendered browser/keyboard/responsive acceptance. Preserve that report, not as exhaustive agent-observed proof. All three bounded WP4 slices are now source-connected below; full WP4 acceptance and advanced gates remain pending. The shared checklist is intentionally not marked complete.

### WP4 — Customer detail and properties

- **Goal:** retain useful customer context and manage official property data.
- **Dependencies/readiness:** WP2–WP3; documented owner-scoped property operations and permission boundaries.
- **Deliverables:** customer detail, property list/create/edit/status actions and return-to-list context, adapted to our responsive visual structure.
- **Acceptance/evidence:** validate selected/owner identities, include inactive properties as documented, preserve `areaM2` decimal bounds and show server fields only. Authorized access instructions/door codes must not leak through logs, audit decoration or broader portal exposure.
- **Traceability:** M03/RF03/HU03/P04; RNF01/RNF08–RNF10/RNF12.
- **Exit:** verified customer/property journey completes the core presentation target; missing sensitive-field or browser checks stay pending.

#### First WP4 slice — read-only delivery boundary

After the explicit user resume, `/admin/customers/:id` connects profile and owner properties only. Desktop/mobile list links and return navigation carry validated effective offset/limit; malformed/missing pairs fall back to 0/20. Invalid positive-int32 IDs dispatch no data reads. CatalogFrame, Helm, semantic tokens and route-local complete toast providers preserve Users/CRM hierarchy without new filters/KPIs, root providers or stores.

Successful customer detail starts the owner property read. Independent profile/property loading/error/retry and same-owner stale refresh/error are distinct from verified empty. Route/session/destruction cancellation fences old owner work; same-session renewal preserves it. Actual metadata, inactive labels, nullable values, zero counts and canonical decimal `areaM2` in m² are retained. Supplied access instructions/door codes are instantiated only after opening a native property disclosure, never in summaries, URLs, toasts or logs. No frontend ACL or portal exposure is inferred.

Deterministic route/DOM/store-contract checks cover this read-only contract, effective page restoration, lifecycle cancellation, SSR and preserved list behavior. Exact observed test/build evidence belongs to the handoff. This first read slice is not full WP4: the second slice adds property create/edit and the third connects desired status; all other writes remain pending. Independent live/backend/redaction/cross-owner and rendered Chrome/Edge/Firefox keyboard/responsive proof remain security/acceptance gates, not established by unit checks or the prior user-reported WP2/WP3 acceptance.

Repeatable next acceptance: CRM → page navigation → Ver detalle → inspect profile → open an authorized non-sensitive property → Volver a clientes on the effective server page. Verify denial/redaction separately without capturing access values. Do not mark the full WP4 exit or shared checklist complete.

#### Second WP4 slice — property create/edit delivery boundary

The resumed authorization continues the same owner detail with New property and Edit only. Explicit Signal Forms/Helm fields preserve the official model and visual rhythm, visible owner context and captured validated list identity, including inactive properties without changing their lifecycle. Full POST/PUT replacement sends address/hasPets and every nullable mutable field; text is trimmed, blank optionals become null, zero counts remain zero and canonical `areaM2` stays bounded decimal text in m². Declarative validation matches existing adapter limits and postal format; no new endpoints, metadata, permission inference or ft² conversion are introduced.

Pending guards prevent duplicate save and Cancel/Escape/outside dismissal; idle dismissal works. Safe inline errors preserve drafts. Confirmed Result success alone emits a generic route-local toast and one forced owner-property read: CustomerPropertiesStore invalidates properties/history, but its finite read API does not auto-refresh like CustomersStore observers. No optimistic arrays/totals or automatic write retries. The unchanged feature-local session/dismissal helper is supplemented with captured owner-ID cancellation/checks for route reuse, page/dialog destruction, session replacement and closing animation. Same-session renewal preserves work; cancellation cannot roll back dispatched writes.

Access instructions/door codes appear only in the intended authorized form/disclosure, never summaries, toasts, URLs, logs or broader portal exposure. Deterministic create/update payload, validation, error, pending and lifecycle checks establish source/selfcheck evidence only; exact results belong to the handoff. Prior corrected WP3 visual/manual/live/browser acceptance is user-reported, not acceptance of this editor. Independent sensitive-owner/redaction/live backend/CORS and rendered Chrome/Edge/Firefox keyboard/responsive proof remain pending. The third bounded slice below connects property desired-state actions; no property delete, WP5 or full WP4 acceptance is claimed.

Repeatable next acceptance: CRM → owner detail → New property → invalid/valid values → save → verify confirmed generic feedback and exactly one owner revalidation → Edit a legitimately loaded item → return to the effective server page. Use authorized non-sensitive data, separately exercise denied/conflict/not-found/network and owner/session cancellation, and never capture access values. Leave the WP4 exit and shared checklist open.

#### Third WP4 slice — property desired-status delivery boundary

The user authorized continuation with “listo continua con la actividad”, then “Review the delivered subagent output and continue.” This slice connects only property desired activation/deactivation, preserving the official model, exact CRM label, accepted shared Users/CRM components and existing theme. References guide functionality, not visual authority.

Explicit Activate/Deactivate captures a legitimately loaded owner-list property, including inactive entries, and a desired boolean. The Helm confirmation identifies owner/name, alias/address/ID and current → desired state; it excludes access instructions/door codes. The unchanged store/source validate the owner, target, boolean and response. No DELETE, customer reactivation/inactive discovery, role-name ACL, speculative inactive restriction, new endpoint or WP5 consumer is added.

Pending blocks duplicate confirmation and Cancel/Escape/outside dismissal; idle dismissal works. Safe inline forbidden/conflict/network/not-found/invalid-response feedback retains the confirmation for explicit retry, without raw errors or false success. Only successful Result delivery emits generic route-local activation/deactivation feedback and one forced owner-property read. Properties/history invalidation stays store-owned; no automatic write retry, optimistic membership/totals or removal of inactive entries. Refreshed rows do not change the captured owner/ID/desired state.

The unchanged customerDialogLifecycle plus ownerChanged$/current checks cancel/fence owner switches, session replacement/loss and page/dialog destruction, including post-await closing animation. Same-session renewal preserves work; cancellation cannot roll back dispatched writes. Public-UI tests exercise both desired states, capture, no write before confirmation, errors/retry, pending/idle dismissal, one dialog/read/toast, inactive membership and lifecycle protection. Preserved read/editor tests and production/SSR compilation are technical evidence only; exact observations belong to the handoff.

All three WP4 slices remain pending independent manual/live backend/CORS, sensitive-owner/redaction and rendered Chrome/Edge/Firefox keyboard/responsive acceptance. Prior WP2/WP3 acceptance is user-reported, not exhaustive agent-observed proof or acceptance of WP4. Keep the WP4 exit/shared checklist open. The subsequent explicit authorization connects only the first contacts-only WP5 slice below, not the rest of WP5.

Repeatable acceptance: CRM → owner detail → Activate a loaded inactive property → confirm named owner/property/state → verify generic toast and one owner read → Deactivate → cancel/error/retry → return with effective page context. Use authorized non-sensitive records; separately verify denied/cross-owner/redacted responses and cancellation without recording access values.

### WP5 — Contacts, preferences and official history

- **Goal:** enrich a validated core without inventing a communications timeline.
- **Dependencies/readiness:** WP4; existing relations/history stores and module-specific history permissions.
- **Deliverables:** scoped contact/preference forms and a history view separating recent service requests, orders and support, with each returned module total. The current contract has no restriction marker: do not infer a per-module restriction state.
- **Acceptance/evidence:** distinguish customer-wide preferences from property-scoped ones; preserve inactive entries and redacted/null history values. No aggregate activity total, synthetic events or false empty results on denied/failed modules.
- **Traceability:** M03/RF03/HU03 and RF12/HU12/P04; RNF01/RNF08–RNF10/RNF12.
- **Exit:** relations/history verified independently. Notes, emails, calls, tags and SMTP are not delivered by this package and need WP12 decisions.

#### First WP5 slice — contacts-only delivery boundary

The user authorized continuation with “excelente trabajo continuemos entonces”; “recuerda hacer commit” was fulfilled by WP4 commit `75452cf` before this slice. This authorization connects contacts list/create/edit only on existing verified customer detail, preserving the official model, exact CRM label, shared Users/CRM CatalogFrame hierarchy, Helm/Signal Forms and route-owned toast scope. That first slice did not accept WP4 independently or include preferences/history UI; the subsequent resumed continuation connects preferences only as bounded below.

CustomerRelationsStore supplies owner-keyed readonly projections and finite loadContacts reads with the existing 120000ms success TTL. Show inactive contacts, null values, loading/unverified, verified empty, retryable errors and verified same-owner rows during refresh/failure; no fake filters/KPIs/global totals. Create/update sends name/position/email/phone/isPrimary/isActive in full, trimmed with blank optionals as null. Bounds 120/80/120/30, required name and optional valid email match the adapter; contact phone has only its length rule. Create defaults non-primary/active; editing captures loaded owner/contact identity, including inactive entries. Status edits use full PUT, never a new lifecycle/delete endpoint or invented primary uniqueness.

Pending prevents duplicate save and Cancel/Escape/outside dismissal; idle dismissal works. Safe inline failures preserve drafts and selected context. Only confirmed Result success emits a generic route-local toast and exactly one forced owner-contact read. Store-owned invalidation of contacts/history never causes another property/preference/history read here. Do not patch arrays/totals optimistically, poll or replay writes; failed revalidation retains verified rows with a visible stale error.

The unchanged customerDialogLifecycle, synchronous page ownerChanged$ cancellation, keyed owner view and captured generation fence owner/session/destruction work and post-await closing-animation feedback. Same-session renewal preserves work; cancellation cannot undo dispatched writes. Public DOM/store-contract tests exercise fields, limits, failures, pending/idle dismissal, one confirmed refresh, inactive/null values and lifecycle fences. WP4 property/detail/return-context tests retain their assertions. Exact focused/full/build evidence belongs to the handoff, not live acceptance.

Repeatable pending acceptance: CRM → detail → New contact → invalid/valid submit → verify generic toast and one owner-contact read → edit an inactive loaded contact → clear optionals/change principal/active → return to effective page. Use authorized non-sensitive records and verify backend/CORS, denials, owner/session boundaries and Chrome/Edge/Firefox keyboard/responsive behavior independently. The second bounded slice below connects preferences and the final bounded slice connects read-only history; full WP5 and independent full WP4 acceptance remain pending. History restriction-marker/non-null support-description contract questions remain outside these relation slices; no synthetic restricted states or timeline are introduced.

#### Second WP5 slice — preferences delivery boundary

The resumed instruction “Review the delivered subagent output and continue” after “excelente trabajo continuemos entonces” connects preferences list/create/edit only on verified customer detail. Preserve the already delivered contacts/property behavior, exact CRM label, official model and shared Users/CRM CatalogFrame, Helm/Signal Forms and route-local toast scope; reference workflows are not visual authority. This is new UI, not inherited user acceptance or completion of WP5.

CustomerRelationsStore supplies owner-keyed readonly projections and finite loadPreferences reads with the existing 120000ms success TTL. Retain inactive entries and distinct loading/unverified, verified empty, error/retry and same-owner stale refresh/failure. Full POST/PUT sends propertyId/type/detail/isActive, capturing loaded owner/preference identity. Type is required trimmed free text up to 50; detail is required trimmed text with no documented maximum; active is an explicit boolean within the full replacement. No invented type catalog, uniqueness/order rule, DELETE or separate status action/endpoint. Render preference content as plain text without interpreted HTML or arbitrary links.

Todo el cliente is null scope. Property choices are positive int32 IDs from legitimately loaded properties of the same owner, including inactive items, reusing the detail's existing read. No new property call or access instructions/door codes in options, summaries or feedback. Actual loading/error/stale option feedback remains visible; general scope is usable without fabricating a verified empty property catalog. An association absent from current verified options retains its ID without an invented name or silent null conversion; saving requires a verified owner property or explicit general change, rechecked at dispatch.

Pending prevents duplicates and Cancel/Escape/outside dismissal; safe errors retain drafts. Only confirmed Result success emits a generic route-local toast and exactly one forced owner-preference read. Store-owned preference/history invalidation remains unchanged; contacts/properties/history are not reloaded, rows/totals are not patched and writes never replay automatically. Failed revalidation keeps verified same-owner rows with visible stale error. Unchanged dialog lifecycle, synchronous ownerChanged$, keyed views and captured generation cancel/fence owner/session/destruction/closing-animation work; same-session renewal preserves it. Cancellation cannot undo dispatched effects.

Public DOM/store-contract tests cover general/property/inactive records, full payloads/limits, missing/unknown/stale choices, safe draft retention, pending/idle dismissal, exact read counts and lifecycle fences; contact/property/return-context assertions remain preserved. Exact observed focused/full/build evidence belongs to the handoff. Repeatable pending acceptance: CRM → detail → New preference → general/loaded inactive property → invalid/valid save → generic toast and one preference read → edit scope/active → return to effective page. Independently verify backend/CORS, denied/cross-owner/redacted responses and Chrome/Edge/Firefox keyboard/responsive interaction. Prior WP2/WP3 acceptance remains user-reported, not acceptance of contacts/preferences. The final bounded slice below connects history UI and documents its absent restriction marker/current non-null support-description constraint. Full WP5 and full WP4 acceptance remain open; no fabricated permissions/restrictions, notes/email/calls/SMTP/timeline are added.

#### Final bounded WP5 slice — official read-only history

The explicit “ok continua” resumes after contacts/preferences commit `a4add4f`. Verified detail now exposes an owner-keyed CustomerHistoryPanel only inside an opened native disclosure. The existing root store owns the owner/limit entry and 30000ms success TTL. Open/revisit uses limit 20 and normal freshness/invalidation checks; close destroys/cancels the finite consumer, owner changes cancel synchronously, session replacement/logout/destruction fence old work, renewal preserves it and SSR dispatches no reads. No local result cache, root subscriptions or store/source/domain changes.

The actual source sends one GET `/api/clientes/{id}/historial?tamanio=20`, parsing requests/orders/support independently at offset zero. Each section displays its own returned range/total and server order, selected plain-text fields, actual UTC dates and canonical amount text. No aggregate activity total, invented pagination/load-more, calculations, history writes, communications timeline or access instructions/door codes. An empty sample is labeled only as no records returned, never proof of permission or complete absence. The current projection has no restriction marker: 403 or a malformed module is one failed Result, with a safe overall retryable error and verified same-owner stale data retained. Request description allows null; support description is currently non-null. Backend DTO/service/OpenAPI are unavailable here; support null fails `INVALID_RESPONSE`, not a synthetic restricted module or silently relaxed parser. Per-module permission/redaction acceptance is not claimed.

After store-owned invalidation, confirmed property create/edit/status and contact/preference create/edit refresh history exactly once only while open. Closed history starts no read; next opening checks invalidation normally. Minimal relation outputs preserve each original own-list refresh/toast and all existing dialog lifecycle rules. Reentrant owner/session changes after toast/list callbacks suppress old-context reads. Failed writes never notify history; failed history revalidation remains visible without replay/false rollback. No polling, optimistic rows/totals or unrelated reloads.

Deterministic public UI tests with real stores cover lazy reads, fresh/expired/invalidated reopen, independent totals, null/plain-text/amount/order rendering, overall denial/malformed errors/stale retry, seven write paths, exact own-list counts and owner/session/destruction/SSR safety. Exact observed commands/results belong to the handoff. This final implementation slice does not mark WP5 accepted or WP4 complete: independent backend/CORS, authorization/redaction and Chrome/Edge/Firefox keyboard/responsive proof remain pending. Repeatable pending acceptance: CRM → detail → open/close/reopen history → inspect each sample/total → confirmed property/contact/preference change with history open/closed → denied/malformed retry → return to the effective server page. Use authorized non-sensitive records without recording access values. Traceability: M03/RF03/HU03 and RF12/HU12/P04; RNF01/RNF08–RNF10/RNF12.

### WP6 — Lead inbox, follow-ups and conversion

- **Goal:** expose the existing acquisition boundary as a coherent administrative workflow.
- **Dependencies/readiness:** customer creation/detail accepted; documented acquisition permissions, paged leads and origin/stage catalogs.
- **Deliverables:** lead inbox/detail/editor, append follow-ups, permitted origin/stage selection and contextual conversion confirmation.
- **Acceptance/evidence:** use Angular `Lead`/`leadId` while retaining Spanish prospect wire names. Conversion sends only ID/type, uses current server data and repeated conversion returns the linked customer; no automatic account, email merge or inferred stage change. Follow-ups do not implicitly change stage.
- **Traceability:** M03/RF03/HU03 supplies customer context; dedicated acquisition/public-quote RF/HU is missing and must be recorded before implementation; RNF09/RNF10/RNF12.
- **Exit:** backend/browser evidence covers normal, repeated, forbidden and failed conversion. Public quote generation remains separately gated.

#### First bounded WP6 slice — authorized read-only inbox

The explicit continuation “sin revision continua con el siguiente wp”, followed by “Review the delivered subagent output and continue.” authorizes only the paged read-only lead inbox and minimal reusable Clientes/Prospectos catalog navigation. M03/RF03/HU03 supplies customer context, not a dedicated acquisition requirement: the missing acquisition/public-quote RF/HU remains recorded, with no invented identifiers. The second bounded slice below adds read-only detail; editor, follow-ups, conversion, catalog administration and public quote/pricing/landing remain later, separately bounded slices. This does not accept WP4/WP5 or complete WP6.

The [connected inbox](../src/app/features/customers/presentation/pages/leads-page/leads-page.ts) at `/admin/customers/leads` precedes dynamic customer `:id`. It reuses the existing root acquisition store and shared CatalogFrame/pagination, initial offset 0/limit 20, actual effective metadata, 30000ms success TTL and consumer-owned cancellation/session/SSR protection. The feature-local navigation has two real consumers: customer list and lead list. Same-query verified rows remain during refreshing/errors; unrelated queries show no borrowed rows. Positive-total empty out-of-range responses allow one corrective read per navigation/retry using the effective limit, never a loop or response rewrite. Origin/stage IDs are explicit IDs, not inferred catalog names; no extra catalog reads, search/status filters, fake KPIs, linked-customer IDs or dead detail links. Preserve the exact CRM sidebar label, IAM/default redirect and official theme. Independent live/backend/CORS and Chrome/Edge/Firefox keyboard/responsive acceptance remain pending.

Repeatable pending acceptance: CRM → Prospectos → inspect actual fields, conversion labels and range → next/previous → Clientes → IAM. Exercise verified empty, initial failure/retry, same-query stale refresh and bounded recovery with authorized non-sensitive data. Deterministic router/DOM/real-store tests are technical evidence only, not live authorization/CORS or rendered browser acceptance; exact test/build observations belong to the handoff. Keep the WP6 exit and shared checklist open.

#### Second bounded WP6 slice — read-only lead detail and effective return

The repeated continuation after inbox commit `43c349f` authorizes only read-only detail/name links and independent lead-list return context. It does not authorize the remainder of WP6 or accept WP4/WP5. The [detail consumer](../src/app/features/customers/presentation/pages/lead-detail-page/lead-detail-page.ts) at `/admin/customers/leads/:id` is ordered before customer `:id`, retaining auth protection and complete route-local toast providers. The official model, exact CRM label, IAM/default redirect, shared CatalogFrame and theme remain unchanged.

Desktop/mobile lead names link with actual returned offset/limit. Independent lead URL validation restores the inbox initial query before reads and supplies the explicit return link, defaulting missing/malformed/duplicate, unaligned or unsafe page/size pairs to 0/20. No customer context/store query changes or duplicate fetch to synchronize effective metadata. Native browser-back restoration from a noncanonical original inbox URL is not claimed. Existing server paging, stale same-query rows and one bounded out-of-range correction remain intact.

Positive decimal int32 lead IDs alone dispatch reads. Root observeLead/selectLead own 30000ms success freshness, identity-specific results and session/SSR protection; route switchMap/DestroyRef owns cancellation. Initial/error/retry and same-ID verified stale refresh/error remain distinct; route replacement never borrows another lead's data and same-session renewal preserves work. Display only supplied contacts/address, plain observation, UTC registration/actor, converted boolean and explicit origin/stage IDs. Null means unregistered, not fabricated zero/customer metadata. No customer lookup, catalog call, follow-up, conversion write or new action launcher.

M03/RF03/HU03 remains contextual; dedicated acquisition/public-quote RF/HU is still missing, not invented. Editor/create, follow-ups, conversion and catalog administration remain later slices; public quote/pricing/landing/SMTP is separately gated. Deterministic route/DOM/real-store tests and compilation are technical evidence only; exact results belong to the handoff. Repeatable pending acceptance: CRM → Prospectos → effective server page → lead name → inspect fields → Volver a prospectos; separately verify invalid IDs, denials, retry/stale data, session changes and Chrome/Edge/Firefox keyboard/responsive behavior with authorized non-sensitive records. Independent live backend/CORS/authorization proof remains pending. Keep WP6 exit/shared checklist and full WP4/WP5 acceptance open.

#### Third bounded WP6 slice — inbox lead creation only

T2/S1–S2 continues the explicit request without investigating prior harness failures. Review boundaries remain separate: inbox/navigation `43c349f`, detail/return context `d705384`, then creation-only `5e1b0b2`; not an accumulated branch candidate. The [inbox](../src/app/features/customers/presentation/pages/leads-page/leads-page.ts) now launches a create-only [LeadEditor](../src/app/features/customers/presentation/components/lead-editor/lead-editor.ts). Editing is T3, not unused scaffolding in this slice.

Root origins/stages finite reads preserve 120000ms TTL and independent pending/error/retry/verified-empty states. Required selections start blank and show actual names/IDs, inactive-origin and final-stage context without invented ACL/transitions. Drafts/identity survive refresh; dispatch rechecks verified available choices. Signal Forms sends only originId/stageId/name/email/phone/referenceAddress/observation; trimmed optional blanks become null. Name/email/phone/address bounds are 120/120/30/200, name required, email valid, phone length-only and observation unbounded. No server-owned metadata inputs.

Unchanged customerDialogLifecycle plus page/dialog cancellation and captured session/overlay checks fence pending dismissal, duplicate saves, session replacement/destruction and closing animation; renewal preserves work, SSR dispatches none. Safe inline errors preserve drafts. Only confirmed Result success closes/emits generic route-local toast. Existing root observations refresh the inbox once with effective metadata; no duplicate reload, optimistic membership/totals or write replay. Cancellation cannot roll back dispatched writes.

M03/RF03/HU03 remains context and dedicated acquisition RF/HU remains missing. Repeatable pending acceptance: CRM → Prospectos → Crear prospecto → invalid/valid save → verify generic toast and one server revalidation → next/previous/detail return. Editing/follow-ups/conversion/catalog administration and public quote/pricing/landing/SMTP remain subsequent or gated scope. Technical tests/build do not certify independent/native approval, live backend/CORS/authorization or Chrome/Edge/Firefox keyboard/responsive acceptance. Prior failed/unexecuted review operations are not retried or declared green. WP6 completion and independent WP4/WP5 acceptance remain pending.

#### Fourth bounded WP6 slice — editing a loaded lead from detail

T3/S1–S2 continues implementation without investigating/retrying prior harness failures. It is an editing-only delta after creation `5e1b0b2`, not a combined branch candidate. The existing LeadEditor accepts additive optional loaded-lead/owner-cancellation context; the inbox creation consumer and its behavior remain unchanged. Detail exposes «Editar prospecto» only for verified data matching its current ID. Capture that Lead/name/ID, prefill the seven documented fields and send full updateLead replacement under the same validation/trim/null rules. No registration/actor/isConverted input, invented linked customer/account, automatic follow-up or inferred stage transition/converted-lead ACL.

Root catalog reads retain TTL/finite caller ownership. Keep selected IDs/drafts during refresh; missing associations remain visibly unavailable until an explicit verified choice/retry, never a default/substitute or invented name. Inactive origins/final stages retain actual labels without inferred restrictions. Dispatch rechecks current verification, including pending/failure states. Pending blocks duplicate saves and dismissal; safe inline failures preserve drafts for explicit retry. Only successful Result delivery emits generic route-local update feedback then closes if current. Existing observeLead/observeLeads invalidation refreshes active detail/inbox consumers exactly once, without extra page reload, patches, synthetic totals or automatic write replay.

OwnerChanged$ cancels synchronously before replacement route selection. Captured owner revision/ID/session/overlay checks and unchanged customerDialogLifecycle fence route/session/destruction/closing-animation work; renewal preserves drafts and pending writes. Cancellation cannot roll back dispatched backend effects. Existing detail invalid-ID/no-read, stale same-ID/error/retry, effective back context and SSR behavior remain preserved.

Repeatable pending acceptance: CRM → Prospectos → loaded detail → Editar prospecto → invalid/valid fields or catalog retry → save → generic toast and one detail/inbox revalidation → effective back link. This supersedes historical editing-as-planned statements only. Follow-ups/conversion/catalog administration remain later tasks, public quote/pricing/landing/SMTP separately gated, and dedicated acquisition RF/HU remains missing under M03/RF03/HU03 context. Tests/build establish technical evidence only. Independent detail verifier and native prior inbox review were not executed and are not retried/reclassified as approval. Independent live/backend/CORS/authorization and Chrome/Edge/Firefox keyboard/responsive acceptance, full WP6 and independent WP4/WP5 acceptance remain pending.

#### Fifth bounded WP6 slice — read-only follow-up consultation

T4/S1–S2 continues after editing `f4634af` without investigating/retrying harness failures; this is its own review delta, not the accumulated branch. Verified matching lead detail exposes a native Seguimientos disclosure. Opening mounts a feature-local reader selecting/observing the existing root follow-up entry; closing destroys/cancels only its subscription. Reopening checks the 30000ms success TTL, retry forces a read and failed refresh retains verified same-owner rows with visible stale/error feedback. Profile/edit remain independent. Synchronous ownerChanged$, keyed views, session/DestroyRef and actual native open/current-disclosure checks fence replacement/destruction/queued events; renewal preserves work and SSR starts none.

Render the unpaged list in server order with plain nullable/empty comments, supplied UTC dates and explicit record/stage/user IDs. No catalogs, actor/customer lookup, invented names/totals/pagination, lead-stage change or future action launchers. Follow-up registration is T7 and conversion T5, both pending; consultation does not complete WP6. M03/RF03/HU03 remains context and dedicated acquisition RF/HU is missing; RNF09/RNF10/RNF12 applies. Pending acceptance: CRM → Prospectos → verified detail → open/close/reopen Seguimientos → error/retry → effective back link. Technical tests/build neither replace unexecuted independent/native review nor establish live backend/CORS/authorization or Chrome/Edge/Firefox keyboard/responsive proof. Full WP6 and independent WP4/WP5 acceptance stay pending.

#### Sixth bounded WP6 slice — follow-up registration from the open panel

T7/S1–S2 follows committed read-only consultation T4 `5386695` as a separate delta, without retrying/investigating harness failures. The verified lead's open Seguimientos panel now launches [LeadFollowUpEditor](../src/app/features/customers/presentation/components/lead-follow-up-editor/lead-follow-up-editor.ts) from the CatalogFrame header. It captures supplied name/ID from the existing root projection, reads only the finite stage catalog (120000ms TTL), and sends leadId/stageId/comment through the existing addFollowUp action. Required stage starts blank; retain actual order/names/IDs/final labels, pending/error/verified-empty/retry and missing selections/drafts. Recheck current verified membership at dispatch, with no inferred stage ACL/default. Optional unbounded comment is trimmed, blank as null. Actor/time are server-owned; follow-up stage does not change Lead.stageId or invoke updateLead.

Pending blocks duplicates and Cancel/Escape/outside dismissal; safe inline failures preserve drafts for explicit retry. Unchanged customerDialogLifecycle plus panel-local synchronous stop cancellation, owner/session/destruction and actual native-open checks fence requests and post-await feedback, including closing animation. Same-session renewal preserves work; cancellation cannot roll back dispatched effects. Only confirmed Result success emits generic route-local feedback. Unchanged store invalidation already revalidates active follow-ups/profile/inboxes once; no duplicate forced read, optimistic append/totals, unrelated catalog read or POST replay. Revalidation errors retain verified rows and explicit GET retry.

Repeatable pending acceptance: CRM → Prospectos → verified detail → open Seguimientos → Registrar seguimiento → validate/submit → confirmed toast and one revalidation → exercise safe failure/draft retry and failed-read retry without another POST. M03/RF03/HU03 supplies context, dedicated acquisition RF/HU remains missing, and T5 conversion/catalog administration stay pending. Deterministic public DOM/router/real-store tests and compilation are technical evidence only, not unavailable independent/native approval or live backend/CORS/authorization/Chrome/Edge/Firefox keyboard/responsive proof. Keep WP6 exit/shared checklist and independent WP4/WP5 acceptance open. Registration-as-planned in historical slices is superseded only by this bounded consumer.

#### Seventh bounded WP6 slice — confirmed lead conversion

T5/S1–S2 connects conversion as a separate candidate after follow-up registration `5780626`, without retrying/investigating failed review operations or presenting the accumulated branch as one delta. Verified matching lead detail keeps Edit in catalogControls and opens a contextual confirmation with captured name/ID and a blank required CustomerType choice. Only leadId/type are sent through existing convertLead; current stored lead data is copied by the backend. No copied contacts, direct createCustomer, account/email merge, inferred stage transition or local converted flag.

Already-converted records remain eligible for explicit backend requests. A repeat returns the actual linked customer, potentially with a stored type different from the requested type: never promise new creation or a type change. Confirmed validated Result success alone emits generic route-local feedback and exposes the returned customer's actual ID link without prospect paging parameters or automatic navigation. Keep only an ephemeral owner/session-scoped link ID, never a copied profile or customer lookup. Existing root observers refresh affected reads once; failure/retry stays GET-only, without duplicate reloads, optimistic totals or POST replay.

Unchanged customerDialogLifecycle and captured owner revision/ID/session/current-overlay/DestroyRef checks protect cancellation and post-await feedback, including closing animation. Pending blocks duplicate confirmation and Cancel/Escape/outside dismissal. Safe inline errors preserve selected type/target for explicit retry; network uncertainty does not prove no backend effect. Same-session renewal preserves work, replacement/destruction clears/fences the link and SSR dispatches none. Cancellation cannot roll back dispatched writes.

Repeatable pending acceptance: CRM → Prospectos → verified detail → Convertir a cliente → select type/confirm → inspect actual customer link → repeat/deny/fail conversion and retry a failed read without replaying POST. M03/RF03/HU03 supplies context, dedicated acquisition RF/HU remains missing (RNF09/RNF10/RNF12). Source-connected UI and technical tests/build do not satisfy independent/native review, live backend/CORS/authorization/repeated-conversion or Chrome/Edge/Firefox keyboard/responsive acceptance. WP6 exit/shared checklist and independent WP4/WP5 acceptance remain open. Only historical conversion-as-planned is superseded; catalog administration/public quote/pricing/SMTP remains gated.

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
| CRM list/editor | Active-only customer pages/profile/status | WP2–WP3 | List plus WP3 create/edit/deactivate source-connected; WP2 and corrected WP3 acceptance user-reported; All three bounded WP4 slices connected; full WP4 acceptance pending. No tags/inactive search inferred. |
| Customer properties | Official owner-scoped property model, `areaM2` | WP4 | Owner list/detail, property create/edit and desired-status confirmation source-connected; full WP4 and independent sensitive-field permission/redaction/live/browser proof pending. |
| Contacts/preferences | Official owner contacts and scoped preferences | WP5 | Contacts and general/property-scoped preferences list/create/edit source-connected on detail; independent relation live/browser proof pending; read-only history is connected by the final bounded slice. |
| Notes/email/call timeline | Official requests/orders/support history, not the same timeline | WP5 / WP12 | Read-only official history source-connected, without module restriction markers; independent live/browser/security proof pending. Communications/tags need scope/contracts and missing traceability. |
| Lead inbox/conversion | Lead pages, follow-ups and atomic customer linkage | WP6 | Paged inbox/detail, effective return context, Clientes/Prospectos navigation and create/edit editor source-connected (edit only from loaded detail); follow-ups/conversion remain planned. Dedicated acquisition RF/HU and independent live/browser proof remain missing. |
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

**Next acceptance action:** verify all three WP4 slices (customer/property reads, create/edit and desired-status confirmation), effective return context and sensitive owner/redaction boundaries against the actual backend and browsers once protected live access is available. Preserve user-reported WP2 and corrected WP3 acceptance and the original shell/theme, without calling them exhaustive agent-observed proof or acceptance of the new editor. Property desired-state actions and the two bounded contacts/preferences WP5 slices are source-connected, not independently accepted; full WP4 acceptance and relation/history manual/live/browser/security proof remain pending. The final bounded WP5 slice connects read-only history without accepting the package. Keep missing evidence pending, not replaced by fixtures or unit/build results.

Writing this roadmap authorizes documentation only. It neither authorizes implementation of every reference capability nor changes the official model, scope, visual structure or business rules.
