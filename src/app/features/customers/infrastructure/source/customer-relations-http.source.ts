import { Injectable } from "@angular/core"
import { CustomerContact } from "../../domain/entities/customer-contact.entity"
import { CustomerPreference } from "../../domain/entities/customer-preference.entity"
import {
  CreateCustomerContactParams,
  UpdateCustomerContactParams,
  CreateCustomerPreferenceParams,
  UpdateCustomerPreferenceParams
} from "../../domain/params/customer-relations.params"
import { customerTransport } from "./customer-http.transport"
import {
  record,
  readId,
  nullableId,
  text,
  nullableText,
  flag,
  sameId,
  owned,
  list,
  input,
  id,
  required,
  email,
  optional
} from "./customer-http.validation"

function contactDto(v: unknown, customerId: number) {
  const p = record(v)
  return owned(
    CustomerContact.create(
      readId(p["idContacto"]),
      readId(p["idCliente"]),
      text(p["nombre"], 120),
      nullableText(p["cargo"], 80),
      nullableText(p["correo"], 120),
      nullableText(p["telefono"], 30),
      flag(p["principal"]),
      flag(p["activo"])
    ),
    customerId
  )
}
function preferenceDto(v: unknown, customerId: number) {
  const p = record(v)
  return owned(
    CustomerPreference.create(
      readId(p["idPreferencia"]),
      readId(p["idCliente"]),
      nullableId(p["idPropiedad"]),
      text(p["tipo"], 50),
      text(p["detalle"]),
      flag(p["activo"])
    ),
    customerId
  )
}
function contactBody(p: CreateCustomerContactParams) {
  input(
    required(p.name, 120) &&
      optional(p.position, 80) &&
      email(p.email) &&
      optional(p.phone, 30) &&
      typeof p.isPrimary === "boolean" &&
      typeof p.isActive === "boolean"
  )
  return {
    nombre: p.name,
    cargo: p.position,
    correo: p.email,
    telefono: p.phone,
    principal: p.isPrimary,
    activo: p.isActive
  }
}
function preferenceBody(p: CreateCustomerPreferenceParams) {
  input(
    (p.propertyId === null || id(p.propertyId)) &&
      required(p.type, 50) &&
      required(p.detail) &&
      typeof p.isActive === "boolean"
  )
  return { idPropiedad: p.propertyId, tipo: p.type, detalle: p.detail, activo: p.isActive }
}
@Injectable({ providedIn: "root" })
export class CustomerRelationsHttpSource {
  private readonly t = customerTransport()
  private readonly http = this.t.http
  private url(customerId: number, resource: string) {
    input(id(customerId))
    return `${this.t.origin}/api/clientes/${customerId}/${resource}`
  }
  listContacts(customerId: number) {
    return this.t.request(
      () => this.http.get<unknown>(this.url(customerId, "contactos"), { transferCache: false }),
      v => list(v, item => contactDto(item, customerId))
    )
  }
  createContact(customerId: number, params: CreateCustomerContactParams) {
    const p = { ...params }
    return this.t.request(
      () =>
        this.http.post<unknown>(this.url(customerId, "contactos"), contactBody(p), {
          transferCache: false
        }),
      v => contactDto(v, customerId)
    )
  }
  updateContact(customerId: number, params: UpdateCustomerContactParams) {
    const p = { ...params }
    return this.t.request(
      () => {
        input(id(p.id))
        return this.http.put<unknown>(
          `${this.url(customerId, "contactos")}/${p.id}`,
          contactBody(p),
          { transferCache: false }
        )
      },
      v => sameId(contactDto(v, customerId), p.id)
    )
  }
  listPreferences(customerId: number) {
    return this.t.request(
      () => this.http.get<unknown>(this.url(customerId, "preferencias"), { transferCache: false }),
      v => list(v, item => preferenceDto(item, customerId))
    )
  }
  createPreference(customerId: number, params: CreateCustomerPreferenceParams) {
    const p = { ...params }
    return this.t.request(
      () =>
        this.http.post<unknown>(this.url(customerId, "preferencias"), preferenceBody(p), {
          transferCache: false
        }),
      v => preferenceDto(v, customerId)
    )
  }
  updatePreference(customerId: number, params: UpdateCustomerPreferenceParams) {
    const p = { ...params }
    return this.t.request(
      () => {
        input(id(p.id))
        return this.http.put<unknown>(
          `${this.url(customerId, "preferencias")}/${p.id}`,
          preferenceBody(p),
          { transferCache: false }
        )
      },
      v => sameId(preferenceDto(v, customerId), p.id)
    )
  }
}
