import { Injectable } from "@angular/core"
import {
  CustomerHistory,
  CustomerRequestHistory,
  CustomerOrderHistory,
  CustomerSupportHistory,
  CustomerHistorySchedule
} from "../../domain/entities/customer-history"
import { customerTransport } from "./customer-http.transport"
import { customerDto } from "./customer-http.source"
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
  owned,
  list,
  input,
  id,
  invalid,
  page,
  decimal,
  integer
} from "./customer-http.validation"

function calendar(v: unknown): string {
  const s = text(v)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return invalid()
  const d = date(`${s}T00:00:00Z`)
  if (d.toISOString().slice(0, 10) !== s) return invalid()
  return s
}
function time(v: unknown): string {
  const s = text(v)
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/.test(s)) return invalid()
  return s
}
function requestDto(v: unknown): CustomerRequestHistory {
  const p = record(v)
  return {
    id: readId(p["idSolicitud"]),
    customerId: readId(p["idCliente"]),
    customer: text(p["cliente"]),
    propertyId: readId(p["idPropiedad"]),
    property: text(p["propiedad"]),
    serviceTypeId: readId(p["idTipoServicio"]),
    serviceType: text(p["tipoServicio"]),
    description: nullableText(p["descripcion"]),
    desiredDate: p["fechaDeseada"] === null ? null : calendar(p["fechaDeseada"]),
    status: text(p["estado"]),
    registeredBy: nullableText(p["registradoPor"]),
    registeredAt: date(p["fechaRegistro"]),
    updatedAt: nullableDate(p["fechaActualizacion"])
  }
}
function scheduleDto(v: unknown): CustomerHistorySchedule {
  const p = record(v)
  return {
    id: readId(p["idProgramacion"]),
    date: calendar(p["fecha"]),
    startTime: time(p["horaInicio"]),
    endTime: time(p["horaFin"]),
    isCurrent: flag(p["vigente"]),
    reason: nullableText(p["motivo"]),
    registeredBy: nullableText(p["registradoPor"]),
    registeredAt: date(p["fechaRegistro"])
  }
}
function orderDto(v: unknown): CustomerOrderHistory {
  const p = record(v),
    minutes = p["duracionEstimadaMinutos"]
  if (minutes !== null && (!integer(minutes) || minutes > 2147483647)) return invalid()
  return {
    id: readId(p["idOrden"]),
    code: text(p["codigo"]),
    status: text(p["estado"]),
    statusName: text(p["estadoNombre"]),
    requestId: nullableId(p["idSolicitud"]),
    customerId: readId(p["idCliente"]),
    customer: text(p["cliente"]),
    propertyId: readId(p["idPropiedad"]),
    property: text(p["propiedad"]),
    serviceTypeId: nullableId(p["idTipoServicio"]),
    serviceType: nullableText(p["tipoServicio"]),
    estimatedMinutes: minutes,
    estimatedAmount:
      p["montoEstimado"] === null ? null : decimal(p["montoEstimado"], 99999999.99, 0),
    observation: nullableText(p["observacion"]),
    schedule: p["programacion"] === null ? null : scheduleDto(p["programacion"]),
    assignees: list(p["asignados"], v => {
      const a = record(v)
      return {
        id: readId(a["idPersonal"]),
        name: text(a["nombre"]),
        phone: nullableText(a["telefono"]),
        role: text(a["rol"])
      }
    }),
    createdAt: date(p["fechaCreacion"]),
    updatedAt: nullableDate(p["fechaActualizacion"])
  }
}
function supportDto(v: unknown): CustomerSupportHistory {
  const p = record(v)
  return {
    id: readId(p["idAtencion"]),
    customerId: readId(p["idCliente"]),
    customer: text(p["cliente"]),
    orderId: nullableId(p["idOrden"]),
    orderCode: nullableText(p["codigoOrden"]),
    typeId: readId(p["idTipo"]),
    type: text(p["tipo"]),
    requiresResponse: flag(p["requiereRespuesta"]),
    status: text(p["estado"]),
    statusName: text(p["estadoNombre"]),
    subject: text(p["asunto"]),
    description: text(p["descripcion"]),
    registeredAt: date(p["fechaRegistro"]),
    closedAt: nullableDate(p["fechaCierre"])
  }
}
@Injectable({ providedIn: "root" })
export class CustomerHistoryHttpSource {
  private readonly t = customerTransport()
  getHistory(customerId: number, limit = 20) {
    return this.t.request(
      () => {
        input(id(customerId) && integer(limit) && limit > 0 && limit <= 2147483647)
        return this.t.http.get<unknown>(`${this.t.origin}/api/clientes/${customerId}/historial`, {
          params: { tamanio: limit },
          transferCache: false
        })
      },
      v => {
        const p = record(v)
        // Each module is independently scoped by the backend. Do not turn restricted
        // pages into a single total, or fabricate an empty result on a denied request.
        const result: CustomerHistory = {
          customer: sameId(customerDto(p["cliente"]), customerId),
          requests: page(p["solicitudes"], v => owned(requestDto(v), customerId), 0, limit),
          orders: page(p["ordenes"], v => owned(orderDto(v), customerId), 0, limit),
          support: page(p["atenciones"], v => owned(supportDto(v), customerId), 0, limit)
        }
        return result
      },
      "CUSTOMER_NOT_FOUND"
    )
  }
}
