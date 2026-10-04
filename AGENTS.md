# Agent instructions

Mandatory guidance for coding agents and automation working on The Real Maids frontend.

## Read first and establish evidence

Read [README.md](README.md), [the product guide](docs/README.md), and this file before changing code or documentation. Then inspect the relevant `package.json`, `angular.json`, `components.json`, TypeScript configuration and source/tests.

- Source, configuration and observed test results establish implementation status; installed dependencies, empty files, types and tokens do not establish completed features.
- This file preserves the accepted technical constraints; the product guide preserves RF/RNF/HU/M/P intent, not implementation evidence.
- Actual backend OpenAPI/Swagger establishes REST contracts; approved Figma designs establish visual references.
- Do not silently change product scope or resolve open questions. Major changes to framework, UI, state, forms, SSR, test runner or cross-cutting architecture require an explicit human decision, recorded here as appropriate. No separate ADR process is required.

## Tools: discover availability, then use local fallback

Do not assume any agent-specific configuration or MCP server is installed. Discover the tools actually exposed by the current environment and report unavailable capabilities or failed calls.

**Angular CLI MCP**, when available, is preferred for Angular work:

1. Run `list_projects` first to discover the workspace and targets.
2. Consult `get_best_practices` before modifying Angular code.
3. Use `search_documentation` for Angular APIs and syntax.
4. Use `run_target` for configured build/test targets.
5. Use the exposed dev-server tools for serve cycles.

If the server or required operation is unavailable or fails, record the limitation and use the workspace-local Angular CLI (`npx ng ...`) or supported npm scripts, never a global CLI. Use Angular schematics for ordinary artifacts when appropriate. Available targets are `build`, `serve` and `test`; do not assume lint or E2E targets.

**Code intelligence MCP**, when exposed (for example Codebase Memory or CodeGraph), can support structural discovery. Discover the actual API, check index status/root/coverage where supported, and confirm relevant findings against source. Tool names such as `list_projects`, `index_status` and `check_index_coverage` are server-specific, not universal requirements. If unavailable, use read-only source/configuration inspection; do not claim graph coverage or infer absence from an incomplete index.

**Spartan CLI:** before adding UI, run:

```bash
npx ng generate @spartan-ng/cli:info --json
```

Reuse installed Helm components; generate missing available components with `npx ng generate @spartan-ng/cli:ui --name=<component>`. Do not guess selectors or manually copy component implementations.

## Architecture and current boundaries

- Angular 22 standalone with TypeScript 6; bootstrap through `bootstrapApplication`, strict typing and the configured `@/*` alias. Use explicit DI/providers and avoid `any`.
- Angular SSR + Express and client hydration are part of the platform. `/login` uses prerender; all other routes currently use client rendering. Review route render modes when real backend sessions are introduced. Guard or abstract browser-only APIs for server execution; do not assume a hosting provider.
- Organize business capabilities under `src/app/features/{auth,customers,users}`, independently of their audience (RNF09/RNF10). Use `domain`, `application`, `infrastructure` and `presentation` only when they protect real boundaries; avoid empty scaffolding and speculative role directories.
- Dependencies point toward domain contracts. Put feature error types in `domain/errors`; domain contracts must not import from `application`. Angular `InjectionToken` and RxJS `Observable` coupling in domain repository contracts is intentional; do not remove it as part of a structural refactor.
- Represent each application action with a `*UseCase` exposing `execute()`; do not group feature actions into `*Service` classes. Keep use cases stateless and HTTP/storage adapters in `infrastructure`, not visual components. Bind repository implementations at the composition root, using `InjectionToken` where appropriate. By explicit user decision, infrastructure repository implementation classes implement the domain interfaces and inject the root-provided in-memory sources; sources do not implement domain repository interfaces. Bind tokens with `useExisting` to root-provided implementations, preserving shared source instances. Keep this boundary for auth, customers, users and roles; do not bind domain tokens directly to sources. In-memory latency must precede validation, mutation, ID allocation and storage writes so unsubscribing before execution prevents effects.
- Keep capability routes, pages, guards and stores with their feature. Auth owns `/login`; `src/app/experiences/admin/admin.routes.ts` owns the temporary `/admin` destination and its page, reusing the auth guard. `app.routes.ts` composes both lazy route sets and existing login redirects. Reserve `core` for cross-cutting configuration/singletons and `shared` for genuinely reusable pieces.
- Use NgRx SignalStore for demonstrated shared presentation state per feature, not a monolithic global store. `AuthStore` and `CustomersStore` remain root-provided in their feature's `presentation/state`; do not change provider/store lifetimes implicitly. `AuthStore` delegates to `LoginUseCase`/`LogoutUseCase` and restores through `GetCurrentUserUseCase`/`AuthRepository.me()` before auth or guest guards decide. Preserve an already-loaded session; clear session on absent-user/restoration errors. The user-approved temporary demo localStorage `authenticated` flag restores after reload, with guarded browser access and no server demo session. It is not secure/backend authentication or a permanent persistence policy. Local form state remains local.
- Use Angular Signal Forms: signal model, declarative `form()` validation, `formRoot`/`formField`, reactive errors and `submit()`/`submitting()`. Do not introduce generic form wrappers without repeated real needs.
- Use Spartan Brain/Helm + Tailwind CSS 4, not Angular Material or Bootstrap. Helm is maintained locally in `libs/ui`, imported through `@spartan-ng/helm/<component>`; `components.json` configures generation and `src/styles.css` holds semantic theme tokens. Primary actions use global navy/foreground and shared enabled hover across users, overlays, login and admin; retain gold accent and coral decoration. Do not duplicate primary overrides in feature hosts.
- M03 uses `customers`/`Customer*` naming. Demo data stays in `customer-in-memory.source.ts`. Its five CRUD/query use cases and `CustomersStore` are not a P04 screen or backend contract.
- Use `DestroyRef`/`takeUntilDestroyed` for component-owned requests; do not couple root store lifetimes or unrelated consumers to a component's destruction. Guard post-await feedback/navigation against destruction. Users and roles demo records live directly in their corresponding in-memory source files, with matching stable role IDs, max-ID-based allocation and defensive date copies. Page entry runs ordinary concurrent catalog queries with component cancellation; do not reintroduce initializer or sequential CRUD seeding complexity. Server-side source fixtures do not create an auth session. User dialogs route outside-click and Escape through guarded Cancel: allow idle dismissal, disable Cancel and prevent dismissal while pending. Preserve accessible names on icon-only actions. No role-management button or modal is exposed; retain role contracts/store and user role selection.
- Current lazy routes are `/login`, temporary protected `/admin` and `/admin/users`. Auth/guest guards exist; role authorization and HTTP interceptors do not. `API_URL` has no provider and HttpClient is not configured. Environment/core placeholders do not define usable contracts; connect new pieces explicitly.

## Security and backend integration

- Angular consumes only the internal REST/JSON API; require HTTPS in production. Backend business validation and authorization are authoritative. Role-aware navigation and private-route protection improve UX but do not authorize requests; never infer a complete ACL from role names or planned landing screens.
- Never call QuickBooks Online directly from Angular or bundle client secrets, private credentials, refresh tokens or backend secrets. QuickBooks OAuth, idempotency and reconciliation belong to the backend; frontend status/error/retry UI must use confirmed internal endpoints.
- Never log passwords, JWTs, payment data or other sensitive information. Handle 401/403 consistently without leaking data.
- JWT persistence/refresh remains open: do not adopt localStorage, sessionStorage or cookies as the permanent solution without an explicit human decision. Public environment configuration may include an API base, never secrets.
- Before integration, obtain actual OpenAPI and confirm base URL/versioning, DTOs, errors, pagination, filters, date/time/timezone and enums. Do not invent endpoints, permissions, duplicate rules or retry semantics from demo data or the functional plan. Record contract differences/open issues in the product guide and test adapter/interceptor mapping, success and failure cases.

## UI and domain behavior

- Reuse Helm variants and semantic tokens. Maintain desktop/tablet/mobile layouts; prefer cards and visible actions over unadapted wide mobile tables.
- Preserve title/context/action hierarchy, accessible labels, required-field/help/error associations, keyboard navigation and focus. Register icons with `provideIcons` when needed; color must never be the only status signal.
- Distinguish loading, empty, error and success. Show progress during submission, prevent duplicate actions and confirm success only after the applicable operation succeeds. Confirm cancellations and permission changes with the affected record visible.
- Distinguish service requests from customer support. Use concrete action verbs and preserve useful record/filter context across navigation.
- Follow the business states in the product guide; do not invent reopenings or exceptional transitions.
- Prepare UI copy for Spanish/English; the i18n library/fallback and operational timezone remain open. Do not choose them implicitly.

## Quality and completion

Use the official Angular `test` target with Vitest, not Jasmine/Karma. Component schematics have `skipTests: true`; create required tests explicitly. Missing tests are not a successful empty suite; do not disable or weaken tests for a green result.

For code changes, compile and run relevant tests through available Angular MCP operations or local CLI. Cover domain edge cases, use-case success/failure, adapter mapping/errors, guard permissions and component validation/loading/error/actions as applicable. Validate SSR/hydration safety and responsive/keyboard behavior for UI changes, including recent Chrome, Edge and Firefox where relevant. Report exact commands and observed outcomes, not inherited test counts.

No E2E or CI/CD is currently configured. Adding E2E requires an explicit tool decision, a reproducible target and documentation; prioritize login, customer CRUD, request-to-assignment, mobile assigned services, allowed/rejected transitions, customer support and backend-only QuickBooks status flows.

A feature is complete only when connected to its consumer/route as applicable, compiled, proportionately tested, secure, permission-aware and equipped with the required data/UI states. Update the implemented/planned distinction and link meaningful behavior to an existing RF/RNF/HU/M/P identifier in the product guide; document missing traceability before implementation. For documentation-only changes, verify relative links, language and claims against source/configuration without asserting unrun builds or tests.
