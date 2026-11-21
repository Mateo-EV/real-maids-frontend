import { apiConflictContext } from "@/app/core/http/api-conflict-context"
import { reservedCustomerEmail } from "./customer-email-conflict"
import { Injectable } from "@angular/core"
import { CustomerListQuery } from "../../domain/models/customer-list-query"
import { Customer, CustomerType } from "../../domain/entities/customer.entity"
import {
  CreateCustomerParams,
  UpdateCustomerParams,
  UpdateOwnProfileParams,
  SetCustomerStatusParams,
  LinkCustomerAccountParams
} from "../../domain/params/customer.params"
import { ownProfileFieldMarker } from "./customer-own-profile-marker"
import { customerTransport } from "./customer-http.transport"
import { ClienteEstadisticas } from "../../domain/params/cliente-estadisticas.params"
import {
  record,
  readId,
  nullableId,
  text,
  nullableText,
  flag,
  date,
  nullableDate,
  sameId,
  page,
  pagination,
  input,
  id,
  required,
  email,
  optional,
  invalid,
  integer,
  accountFlag
} from "./customer-http.validation"
import { accountFieldMarker } from "./customer-account-marker"

/** Server counts are nonnegative safe integers; no cross-count arithmetic is asserted here. */
function count(v: unknown): number {
  return integer(v) ? v : invalid()
}
/** Frozen aggregate contract; an absent field is an invalid response, never an invented zero. */
export function clientStatisticsDto(v: unknown): ClienteEstadisticas {
  const p = record(v)
  return {
    total: count(p["total"]),
    activos: count(p["activos"]),
    inactivos: count(p["inactivos"])
  }
}

export function customerDto(v: unknown): Customer {
  const p = record(v)
  const type = p["tipo"]
  if (type !== CustomerType.RESIDENTIAL && type !== CustomerType.COMMERCIAL) return invalid()
  const rawAccountActive = p["usuarioActivo"]
  const userId = nullableId(p["idUsuario"])
  const accountActive = accountFlag(rawAccountActive)
  // If the response names an account, the state must be a boolean. Two edge cases are separated here:
  // a payload that predates `usuarioActivo` (absent) stays readable but is flagged unknown, so reads keep
  // working and the editor refuses to mutate that account; an explicit `null` next to an id is
  // contradictory and would read as "sin cuenta", inviting a create, so it stays invalid.
  const accountStateUnknown = userId !== null && rawAccountActive === undefined
  if (userId === null ? accountActive !== null : rawAccountActive === null) invalid()
  return Customer.create(
    readId(p["idCliente"]),
    text(p["nombre"], 150),
    userId,
    type,
    nullableText(p["correo"], 120),
    nullableText(p["telefono"], 30),
    nullableText(p["identificacionFiscal"]),
    nullableText(p["sistemaOrigen"]),
    nullableText(p["idExterno"]),
    flag(p["activo"]),
    date(p["fechaCreacion"]),
    nullableDate(p["fechaActualizacion"]),
    nullableId(p["usuarioRegistro"]),
    nullableId(p["idProspecto"]),
    accountActive,
    accountStateUnknown
  )
}
/**
 * Documented ClienteRequest body. The account keys keep the wire tri-state: `crearCuenta` is omitted
 * when the caller does not ask for a change, `password` only travels with `crearCuenta: true`, and a
 * password without that flag or a requested account without email/password is refused before HTTP.
 */
/** Documented customer phone rule; the own-profile payload reuses it unchanged. */
const phonePattern = /^\+?[0-9 ()-]{7,30}$/
function body(p: CreateCustomerParams) {
  input(
    required(p.name, 150) &&
      Object.values(CustomerType).includes(p.type) &&
      email(p.email) &&
      optional(p.phone, 30) &&
      (p.phone === null || phonePattern.test(p.phone))
  )
  const createAccount = p.createAccount,
    password = p.password ?? null
  input(createAccount === undefined || typeof createAccount === "boolean")
  input(password === null || (typeof password === "string" && password.length > 0))
  if (createAccount === true) input(password !== null && required(p.email, 120))
  else input(password === null)
  return {
    nombre: p.name,
    tipo: p.type,
    correo: p.email,
    telefono: p.phone,
    ...(createAccount === undefined ? {} : { crearCuenta: createAccount }),
    ...(createAccount === true ? { password } : {})
  }
}
/**
 * Documented own-profile body (`PUT /api/clientes/me`): exactly `nombre` and `telefono`, validated
 * with the staff profile rules. Every other field of the staff request is rejected by the backend, so
 * this function cannot carry one: the returned object is the whole payload.
 */
function ownProfileBody(p: UpdateOwnProfileParams) {
  input(
    required(p.name, 150) &&
      optional(p.phone, 30) &&
      (p.phone === null || phonePattern.test(p.phone))
  )
  return { nombre: p.name, telefono: p.phone }
}
@Injectable({ providedIn: "root" })
export class CustomerHttpSource {
  private readonly transport = customerTransport()
  private readonly http = this.transport.http
  private readonly url = `${this.transport.origin}/api/clientes`
  findPage(query: CustomerListQuery = {}) {
    const { offset, limit } = query
    const search = query.search?.trim()
    const type = query.type
    return this.transport.request(
      () => {
        input(type === undefined || Object.values(CustomerType).includes(type))
        const params = {
          ...pagination(offset, limit),
          ...(search ? { busqueda: search } : {}),
          ...(type ? { tipo: type } : {})
        }
        return this.http.get<unknown>(this.url, { params, transferCache: false })
      },
      v => {
        const requested = pagination(offset, limit)
        const customers = page(v, customerDto, requested.pagina, requested.tamanio)
        if (customers.items.some(c => !c.isActive)) invalid()
        return customers
      },
      "CUSTOMER_NOT_FOUND"
    )
  }
  findById(customerId: number) {
    return this.transport.request(
      () => {
        input(id(customerId))
        return this.http.get<unknown>(`${this.url}/${customerId}`, { transferCache: false })
      },
      v => sameId(customerDto(v), customerId),
      "CUSTOMER_NOT_FOUND"
    )
  }
  findStatistics() {
    return this.transport.request(
      () => this.http.get<unknown>(`${this.url}/estadisticas`, { transferCache: false }),
      clientStatisticsDto
    )
  }
  create(params: CreateCustomerParams) {
    const p = { ...params }
    return this.transport.request(
      () =>
        this.http
          .post<unknown>(this.url, body(p), { transferCache: false, context: apiConflictContext() })
          .pipe(accountFieldMarker(), reservedCustomerEmail()),
      customerDto,
      "CUSTOMER_NOT_FOUND"
    )
  }
  update(params: UpdateCustomerParams) {
    const p = { ...params }
    return this.transport.request(
      () => {
        input(id(p.id))
        return this.http
          .put<unknown>(`${this.url}/${p.id}`, body(p), {
            transferCache: false,
            context: apiConflictContext()
          })
          .pipe(accountFieldMarker(), reservedCustomerEmail())
      },
      v => sameId(customerDto(v), p.id),
      "CUSTOMER_NOT_FOUND"
    )
  }
  /**
   * WP10 T7 — the caller's own profile. No id and no query: the backend resolves the customer from
   * the session. A `404` is the documented "account not linked yet" answer and keeps its own code, so
   * a consumer can render it as a stable state instead of a retryable failure.
   */
  findOwnProfile() {
    return this.transport.request(
      () => this.http.get<unknown>(`${this.url}/me`, { transferCache: false }),
      customerDto,
      "CUSTOMER_NOT_FOUND"
    )
  }
  /** Own-profile update: exactly `nombre` and `telefono`; no id, type, email or account field. */
  updateOwnProfile(params: UpdateOwnProfileParams) {
    const p = { ...params }
    return this.transport.request(
      () => {
        const payload = ownProfileBody(p)
        return this.http
          .put<unknown>(`${this.url}/me`, payload, {
            transferCache: false,
            context: apiConflictContext()
          })
          .pipe(ownProfileFieldMarker())
      },
      customerDto,
      "CUSTOMER_NOT_FOUND"
    )
  }
  setStatus(params: SetCustomerStatusParams) {
    const p = { ...params }
    return this.transport.request(
      () => {
        input(id(p.customerId) && typeof p.isActive === "boolean")
        return this.http.patch<unknown>(
          `${this.url}/${p.customerId}/estado`,
          { activo: p.isActive },
          { transferCache: false }
        )
      },
      v => {
        const c = sameId(customerDto(v), p.customerId)
        if (c.isActive !== p.isActive) invalid()
        return c
      },
      "CUSTOMER_NOT_FOUND"
    )
  }
  linkAccount(params: LinkCustomerAccountParams) {
    const p = { ...params }
    return this.transport.request(
      () => {
        input(id(p.customerId) && (p.userId === null || id(p.userId)))
        return this.http.put<unknown>(
          `${this.url}/${p.customerId}/cuenta`,
          { idUsuario: p.userId },
          { transferCache: false }
        )
      },
      v => {
        const c = sameId(customerDto(v), p.customerId)
        if (c.userId !== p.userId) invalid()
        return c
      },
      "CUSTOMER_NOT_FOUND"
    )
  }
}
