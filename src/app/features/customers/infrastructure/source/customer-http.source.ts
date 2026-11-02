import { Injectable } from "@angular/core"
import { Customer, CustomerType } from "../../domain/entities/customer.entity"
import {
  CreateCustomerParams,
  UpdateCustomerParams,
  SetCustomerStatusParams,
  LinkCustomerAccountParams
} from "../../domain/params/customer.params"
import { customerTransport } from "./customer-http.transport"
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
  list,
  input,
  id,
  required,
  email,
  optional,
  invalid
} from "./customer-http.validation"

export function customerDto(v: unknown): Customer {
  const p = record(v)
  const type = p["tipo"]
  if (type !== CustomerType.RESIDENTIAL && type !== CustomerType.COMMERCIAL) return invalid()
  return Customer.create(
    readId(p["idCliente"]),
    text(p["nombre"], 150),
    nullableId(p["idUsuario"]),
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
    nullableId(p["idProspecto"])
  )
}
function body(p: CreateCustomerParams) {
  input(
    required(p.name, 150) &&
      Object.values(CustomerType).includes(p.type) &&
      email(p.email) &&
      optional(p.phone, 30) &&
      (p.phone === null || /^\+?[0-9 ()-]{7,30}$/.test(p.phone))
  )
  return { nombre: p.name, tipo: p.type, correo: p.email, telefono: p.phone }
}
@Injectable({ providedIn: "root" })
export class CustomerHttpSource {
  private readonly transport = customerTransport()
  private readonly http = this.transport.http
  private readonly url = `${this.transport.origin}/api/clientes`
  findAll() {
    return this.transport.request(
      () => this.http.get<unknown>(this.url, { transferCache: false }),
      v => {
        const customers = list(v, customerDto)
        if (customers.some(c => !c.isActive)) invalid()
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
  create(params: CreateCustomerParams) {
    const p = { ...params }
    return this.transport.request(
      () => this.http.post<unknown>(this.url, body(p), { transferCache: false }),
      customerDto,
      "CUSTOMER_NOT_FOUND"
    )
  }
  update(params: UpdateCustomerParams) {
    const p = { ...params }
    return this.transport.request(
      () => {
        input(id(p.id))
        return this.http.put<unknown>(`${this.url}/${p.id}`, body(p), { transferCache: false })
      },
      v => sameId(customerDto(v), p.id),
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
