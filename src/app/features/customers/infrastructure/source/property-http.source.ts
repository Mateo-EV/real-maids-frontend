import { Injectable } from "@angular/core"
import { Property } from "../../domain/entities/property.entity"
import { CreatePropertyParams, UpdatePropertyParams } from "../../domain/params/property.params"
import { customerTransport } from "./customer-http.transport"
import {
  record,
  readId,
  text,
  nullableText,
  flag,
  date,
  sameId,
  owned,
  list,
  input,
  id,
  required,
  optional,
  decimal,
  invalid
} from "./customer-http.validation"

function count(v: unknown, max: number): number | null {
  if (v === null) return null
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > max) return invalid()
  return v
}
function propertyDto(v: unknown, customerId: number): Property {
  const p = record(v)
  return owned(
    Property.create(
      readId(p["idPropiedad"]),
      readId(p["idCliente"]),
      nullableText(p["alias"], 80),
      text(p["direccion"], 200),
      nullableText(p["ciudad"], 80),
      nullableText(p["estadoRegion"], 80),
      nullableText(p["codigoPostal"], 15),
      p["areaM2"] === null ? null : decimal(p["areaM2"]),
      count(p["numeroAmbientes"], 200),
      count(p["numeroBanos"], 100),
      nullableText(p["instruccionesAcceso"], 2000),
      nullableText(p["codigoPuerta"], 30),
      flag(p["tieneMascotas"]),
      flag(p["activo"]),
      date(p["fechaCreacion"])
    ),
    customerId
  )
}
function body(p: CreatePropertyParams) {
  input(
    optional(p.alias, 80) &&
      required(p.address, 200) &&
      optional(p.city, 80) &&
      optional(p.region, 80) &&
      optional(p.postalCode, 15) &&
      (p.postalCode === null || /^[A-Za-z0-9 -]{3,15}$/.test(p.postalCode)) &&
      optional(p.accessInstructions, 2000) &&
      optional(p.doorCode, 30) &&
      typeof p.hasPets === "boolean"
  )
  input(
    p.roomCount === null ||
      (Number.isInteger(p.roomCount) && p.roomCount >= 0 && p.roomCount <= 200)
  )
  input(
    p.bathroomCount === null ||
      (Number.isInteger(p.bathroomCount) && p.bathroomCount >= 0 && p.bathroomCount <= 100)
  )
  input(
    p.areaM2 === null ||
      (typeof p.areaM2 === "string" &&
        /^\d{1,6}(?:\.\d{1,2})?$/.test(p.areaM2) &&
        Number(p.areaM2) >= 1 &&
        Number(p.areaM2) <= 999999.99)
  )
  return {
    alias: p.alias,
    direccion: p.address,
    ciudad: p.city,
    estadoRegion: p.region,
    codigoPostal: p.postalCode,
    areaM2: p.areaM2 === null ? null : Number(p.areaM2),
    numeroAmbientes: p.roomCount,
    numeroBanos: p.bathroomCount,
    instruccionesAcceso: p.accessInstructions,
    codigoPuerta: p.doorCode,
    tieneMascotas: p.hasPets
  }
}
@Injectable({ providedIn: "root" })
export class PropertyHttpSource {
  private readonly t = customerTransport()
  private readonly http = this.t.http
  private url(customerId: number) {
    input(id(customerId))
    return `${this.t.origin}/api/clientes/${customerId}/propiedades`
  }
  findByCustomer(customerId: number) {
    return this.t.request(
      () => this.http.get<unknown>(this.url(customerId), { transferCache: false }),
      v => list(v, item => propertyDto(item, customerId)),
      "PROPERTY_NOT_FOUND"
    )
  }
  create(customerId: number, params: CreatePropertyParams) {
    const p = { ...params }
    return this.t.request(
      () => this.http.post<unknown>(this.url(customerId), body(p), { transferCache: false }),
      v => propertyDto(v, customerId),
      "PROPERTY_NOT_FOUND"
    )
  }
  update(customerId: number, params: UpdatePropertyParams) {
    const p = { ...params }
    return this.t.request(
      () => {
        input(id(p.id))
        return this.http.put<unknown>(`${this.url(customerId)}/${p.id}`, body(p), {
          transferCache: false
        })
      },
      v => sameId(propertyDto(v, customerId), p.id),
      "PROPERTY_NOT_FOUND"
    )
  }
  setStatus(customerId: number, propertyId: number, isActive: boolean) {
    return this.t.request(
      () => {
        input(id(propertyId) && typeof isActive === "boolean")
        return this.http.patch<unknown>(
          `${this.url(customerId)}/${propertyId}/estado`,
          { activo: isActive },
          { transferCache: false }
        )
      },
      v => {
        const p = sameId(propertyDto(v, customerId), propertyId)
        if (p.isActive !== isActive) invalid()
        return p
      },
      "PROPERTY_NOT_FOUND"
    )
  }
}
