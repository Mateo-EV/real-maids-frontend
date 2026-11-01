# Customers and acquisition domain — area B

All eight SQL tables are represented below. Only the existing five-operation customer demo is wired; the new acquisition, property, account/status and relationship contracts have no HTTP adapter, application actions, routes or UI. This models M03/RF03/HU03 and RF12/HU12 intent without claiming P04 delivery. Acquisition has no more specific inherited RF/HU identifier; that traceability remains open.

## Schema coverage

Paths are relative to this feature.

| SQL table               | Entity path                                                         | Coverage                                                                                 |
| ----------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `origen_prospecto`      | [ProspectOrigin](domain/entities/prospect-origin.entity.ts)         | ID, name, nullable description, active                                                   |
| `etapa_embudo`          | [FunnelStage](domain/entities/funnel-stage.entity.ts)               | ID, name, order, final flag                                                              |
| `prospecto`             | [Prospect](domain/entities/prospect.entity.ts)                      | Origin/stage/user IDs, contact/reference/observation, conversion flag, registration date |
| `seguimiento_prospecto` | [ProspectFollowUp](domain/entities/prospect-follow-up.entity.ts)    | Prospect/user/stage IDs, nullable comment, event date                                    |
| `cliente`               | [Customer](domain/entities/customer.entity.ts)                      | Every public SQL field, including nullable prospect ID omitted by the prototype          |
| `contacto_cliente`      | [CustomerContact](domain/entities/customer-contact.entity.ts)       | Customer ID, contact fields, primary/active flags                                        |
| `propiedad`             | [Property](domain/entities/property.entity.ts)                      | Customer ID, address/location, decimal area, counts, access fields, pets/active/date     |
| `preferencia_cliente`   | [CustomerPreference](domain/entities/customer-preference.entity.ts) | Customer/nullable property IDs, open type, detail, active                                |

All entities use private positional constructors and static `create()`. Factories preserve supplied values, rather than imposing speculative validation or transitions. Foreign keys stay numeric IDs; no entity imports another feature.

## Confirmed versus proposed contracts

Evidence was read-only: `D:/java/sistema_the_real_maids/realmaids_mysql_64_tablas.sql` establishes fields, nullability and CHECK constraints. Backend files under `backend/src/main/java/utp/edud/pe/backend/` establish the following operations; source inspection does not certify live API acceptance.

| Contract                                                                                  | Evidence/status                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CustomerRepository](domain/repositories/customer.repository.ts)                          | Existing wired demo: list, lookup, create, update, delete. `ClienteController` confirms active-name-ordered listing, lookup, create and profile replacement. **Delete is demo-only**, not a backend endpoint. Demo listing retains its previous complete catalog semantics. |
| [Create/UpdateCustomerParams](domain/params/customer.params.ts)                           | Confirmed `ClienteRequest`: name, type, nullable email and phone only. Generated IDs/dates/registration identity and account linking are excluded.                                                                                                                          |
| [CustomerCapabilitiesRepository](domain/repositories/customer-capabilities.repository.ts) | Confirmed `ClienteController` desired status and nullable portal-account linking. Unwired, not forced into the demo implementation.                                                                                                                                         |
| [PropertyRepository](domain/repositories/property.repository.ts)                          | Confirmed `PropiedadController`: customer-owned list, create, update and desired status. [Params](domain/params/property.params.ts) match mutable `PropiedadRequest` fields; owner is a separate argument. Unwired.                                                         |
| [AcquisitionRepository](domain/repositories/acquisition.repository.ts)                    | **Proposed** catalog reads/writes, paged prospect lookup/create/update, associated follow-up read/append. No matching controller found in the inspected controller directory. No conversion workflow or stage-transition policy is invented.                                |
| [CustomerRelationsRepository](domain/repositories/customer-relations.repository.ts)       | **Proposed** customer-owned contacts/preferences read/create/update. No matching controller found. Property scope may be null.                                                                                                                                              |

`ClienteResponse` is narrower than the SQL snapshot: it returns ID, name, type, email, phone, active, linked user and creation/update dates, but not prospect/tax/origin/external/registration fields. Those remain nullable schema fields, **not claimed available from that response**. A future adapter must explicitly reconcile missing data rather than invent values. `PropiedadResponse` covers the modeled property fields. Its BigDecimal must be converted without losing decimal precision; no transport codec is introduced here.

`ClienteController` also confirms customer history (recent requests/orders/support and per-type totals, permission-dependent). Its cross-area response contract is deliberately deferred: this slice does not invent duplicate operations/support entities or add a cross-feature dependency loop. No table is omitted by this deferral. Follow-ups are append-only in the proposed contract; their timestamp/actor are server metadata. Prospect conversion and registration identity are not writable profile fields. SQL uniqueness/FK enforcement and all business authorization remain backend responsibilities; no automatic retries or transitions are specified.

## Representation and security

- SQL INT identifiers/counts/order use `number`; all area B identifiers are INT. New BIGINT identifiers elsewhere use `string`; none are introduced here.
- SQL nullable columns use explicit `| null`, including customer update date. Create/update params distinguish omitted generated metadata from nullable mutable values.
- DECIMAL `area_m2` is `string | null`, preserving precision and trailing zeros without frontend arithmetic. DATETIME uses `Date`; no operational timezone is selected. DATE/TIME would use calendar/time strings; area B has neither.
- Only `chk_cliente_tipo` closes a value set: `CustomerType.RESIDENTIAL = "residencial"` and `COMMERCIAL = "comercial"`. Origin/stage/preference types remain open catalog strings.
- No password/session hashes, OAuth credentials or processor token references belong to these models. Property door codes and access instructions are confirmed public property DTO fields, retained as nullable sensitive operational data: do not log them or include them in generic audit dumps. The backend controller explicitly excludes door codes from audit.
- Typed `CustomerError` is shared across this feature's contracts. Proposed codes are domain categories, not claims about confirmed backend error payloads. Repositories use `Observable<Result<..., CustomerError>>` and distinct `InjectionToken`s; proposed pagination reuses shared contracts.

## Prototype compatibility

The pre-existing user edit's numeric IDs, English fields and factory intent are retained. Required-but-SQL-nullable fields were corrected, `prospectId` restored and type keys/wire values aligned. The five stateless use cases and root `CustomersStore` remain in place. The demo source assigns numeric IDs above the maximum fixture ID, never reuses consumed IDs, and delays reads/mutations/ID allocation until the latency boundary. Cancellation before that boundary prevents effects. Profile updates preserve generated/linked metadata; input snapshots and defensive date copies isolate callers and source instances. No HTTP fallback or new capability implementation was added.

Factory tests cover all fields, nulls, decimal text and dates. Contract tests exercise typed errors, tokens and coherent owner-scoped signatures; existing demo/store/use-case/delegation/cancellation tests remain, adapted to numeric IDs and explicit params. Builds and browser acceptance remain the parent integration responsibility, not documentation claims.
