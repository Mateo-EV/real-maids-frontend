# Billing domain — area F

Domain-only schema coverage for invoices and collection records. This is **not QuickBooks**, a payment processor integration, a working billing screen or an available API. No repository implementation, binding, HTTP request, financial arithmetic or collection retry is added.

## Schema coverage

Evidence: read-only `D:/java/sistema_the_real_maids/realmaids_mysql_64_tablas.sql`, area F. Every assigned table is represented; column names are translated into English without changing FK identity or nullability.

| SQL table             | Entity                                                                  | Notes                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metodo_pago`         | [PaymentMethod](domain/entities/payment-method.entity.ts)               | Safe display metadata only; nullable `ultimos_digitos` → `lastDigits`. **`referencia_token` deliberately excluded** from entities, params and repository contracts.         |
| `estado_pago`         | [PaymentStatus](domain/entities/payment-status.entity.ts)               | Name and display order, not an inferred transition model.                                                                                                                   |
| `comprobante`         | [Invoice](domain/entities/invoice.entity.ts)                            | Order/customer/payment-status IDs; number, subtotal, tax, total, outstanding balance, issuance and nullable due date. Local billing document, not a QuickBooks Invoice DTO. |
| `detalle_comprobante` | [InvoiceLine](domain/entities/invoice-line.entity.ts)                   | Invoice ID; nullable service-type/additional-service IDs; description, quantity, unit price, subtotal.                                                                      |
| `pago`                | [Payment](domain/entities/payment.entity.ts)                            | Nullable method/external-reference/recording-user fields remain nullable. External reference is a payment reference, never a processor credential.                          |
| `intento_cobro`       | [CollectionAttempt](domain/entities/collection-attempt.entity.ts)       | Historical result/attempt number/rejection reason; nullable method and rejection reason.                                                                                    |
| `ajuste_cobranza`     | [CollectionAdjustment](domain/entities/collection-adjustment.entity.ts) | Invoice/user IDs, open type, amount, reason and timestamp.                                                                                                                  |

## Contract status

All operations in [BillingRepository](domain/repositories/billing.repository.ts) and [its explicit params](domain/params/billing.params.ts) are **proposed, schema-derived domain contracts**, not confirmed REST operations. No endpoint is invented. Read and action failures use [BillingError](domain/errors/billing.error.ts); its codes are frontend contract proposals, not a claim about backend error payloads.

| Purpose                        | Proposed contract and boundary                                                                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read catalogs                  | Payment statuses and a customer's safe payment-method metadata. No catalog administration or method enrollment contract: tokenization/processor handling must be defined exclusively by the backend.                                                                    |
| Update safe method metadata    | Only default/active flags. No token, card data, type or last-digit mutation input.                                                                                                                                                                                      |
| Read billing documents         | Shared query pagination, invoice identity and associated lines; separate paged payment/attempt/adjustment history scoped by invoice ID. No duplicate page type.                                                                                                         |
| Issue an invoice               | Explicit order/customer/number/due-date/line input; generated identity, issuance timestamp, status, totals and balance are excluded. Backend derivation/numbering/tax policy and atomicity require confirmation before implementation; the frontend calculates nothing. |
| Record a payment or adjustment | Purpose-oriented append actions scoped by invoice ID. Backend owns actor/timestamp; no update/delete of historical records. Accounting rules, authorization, idempotency and effects on balance/status are unresolved.                                                  |
| Inspect collection attempts    | Read-only history. No create/edit/delete, processor invocation, retry launcher, schedule or guessed maximum attempts.                                                                                                                                                   |

These proposals do not establish that invoice issuance, payment recording or adjustment types are currently supported. No guessed create/update inputs are added for backend-generated attempts/history. All write semantics must be confirmed before integration.

## Representation and security

- SQL INT IDs and quantity/order fields use `number`; this area has no BIGINT ID. FKs remain scalar IDs without cross-feature entity imports.
- Every DECIMAL is a `string`, preserving scale and precision (`"99999999.99"`, `"0.00"`). No numeric conversion or money arithmetic occurs.
- DATE is a calendar `string`; DATETIME is `Date`. There are no TIME columns here; future TIME representations must remain strings. No operational timezone is selected.
- SQL nullable columns use `| null`, never omitted entity fields. Optional update fields mean leave unchanged; nullable action inputs remain explicit.
- No area-F CHECK closes status/type/result values: they remain open strings. Seed data, comments and default values do not define enums or business transitions.
- Constructors are private and positional; `static create` preserves supplied values like User, without pretending to validate unknown transport data. Future adapters must validate DTOs, dates and decimal strings and sanitize error details/references; no raw backend error or secret-bearing payload should reach these models.

## Verification and traceability

[Factory tests](domain/billing-domain.spec.ts) compare every field, null alternatives, decimal scale and Date/calendar semantics. [Contract tests](domain/billing-contracts.spec.ts) cover typed errors, DI token, shared page/result signatures and action inputs. These are domain checks, not backend/browser acceptance.

Billing supports the planned internal payment-follow-up journey and RNF09/RNF10/RNF12. The inherited product plan has no dedicated billing RF/HU; that traceability gap remains open. M12/RF16–RF17/HU16–HU17 describes separate backend-only QuickBooks integration, not delivery of this billing feature.
