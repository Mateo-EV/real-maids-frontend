# Product scope and journeys

The Real Maids frontend is a responsive web application for managing cleaning services internally and giving customers a portal to follow their requests and services and contact customer support. This guide preserves the functional plan; it does not certify implemented features. See [the Spanish project overview](../README.md) for onboarding and current status, and [agent instructions](../AGENTS.md) for technical, security and quality rules.

## Current delivery boundary

Only P01 (M01/RF01/HU01) is a connected frontend demo: login, form validation, safe redirects, session guards and logout with an in-memory source. Auth and guest guards wait for current-user restoration through the use case and store. A user-approved temporary localStorage `authenticated` flag restores the demo session after reload; it is editable client-side, not secure authentication or backend authorization. Server rendering and inaccessible storage fail closed without a demo session. Logout clears the flag when storage is available and clears the loaded store session. Permanent session persistence/refresh remains open. `/admin` is a temporary protected destination, not P02.

M02 (RF02/HU02) has a `users` domain, five stateless query/CRUD use cases and a DI-bound in-memory source. User creation and updates include age. The demo starts empty, assigns sequential numeric IDs and operation-time timestamps, isolates returned records/dates and never stores passwords. It is not credential management, persistence, an HTTP contract, role authorization or the P03 screen. Age validation and email uniqueness policy remain unresolved; the existing `EMAIL_ALREADY_EXISTS` error code is not enforced by this demo.

M03 has a `customers` domain, five query/CRUD use cases, an in-memory adapter and a presentation store, but no P04 route or UI. It does not deliver customer management/history to users or define backend DTOs, persistence or email uniqueness. All other screens and the customer portal remain planned. Real HTTP authentication/integration, JWT persistence, role permissions, E2E and CI/CD are absent; production deployment is unverified. Existing unit tests are not a claim of a newly verified pass or fixed test count.

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
- **M11 — Dashboard:** RF14/HU14, P02 for administrators/authorized supervision, not the current `/admin` placeholder.
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
