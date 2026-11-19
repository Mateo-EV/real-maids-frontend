import { SupportFollowUpView, SupportRequestView } from "../../domain/models/support-views"

export const supportRequestsUrl = "https://api.example.test/api/atenciones"
export const supportTypesUrl = "https://api.example.test/api/catalogos/tipos-atencion"

// Wire DTO fixture of AtencionResponse; nulls are the documented nullable fields.
export const atencionDto = (overrides: Record<string, unknown> = {}) => ({
  idAtencion: 17,
  idCliente: 8,
  cliente: "Cliente autorizado",
  idOrden: null,
  codigoOrden: null,
  idTipo: 4,
  tipo: "Consulta",
  requiereRespuesta: true,
  estado: "RECIBIDA",
  estadoNombre: "Recibida",
  asunto: "Consulta de facturación",
  descripcion: "  Texto literal  ",
  fechaRegistro: "2026-03-01T23:30:00-05:00",
  fechaCierre: null,
  ...overrides
})

export const atencionView = (overrides: Partial<SupportRequestView> = {}): SupportRequestView => ({
  id: 17,
  customerId: 8,
  customerName: "Cliente autorizado",
  orderId: null,
  orderCode: null,
  requestTypeId: 4,
  requestTypeName: "Consulta",
  requiresResponse: true,
  state: "RECIBIDA",
  stateName: "Recibida",
  subject: "Consulta de facturación",
  description: "  Texto literal  ",
  registeredAt: new Date("2026-03-02T04:30:00Z"),
  closedAt: null,
  ...overrides
})

// `autor` is legitimately null when the backend redacts staff names for a customer.
export const seguimientoDto = (overrides: Record<string, unknown> = {}) => ({
  idSeguimiento: 18,
  autor: null,
  delCliente: false,
  mensaje: "  Respuesta literal  ",
  fecha: "2026-03-02T11:00:00-05:00",
  ...overrides
})

export const seguimientoView = (
  overrides: Partial<SupportFollowUpView> = {}
): SupportFollowUpView => ({
  id: 18,
  author: null,
  isFromCustomer: false,
  message: "  Respuesta literal  ",
  createdAt: new Date("2026-03-02T16:00:00Z"),
  ...overrides
})

export function pageOf(contenido: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    contenido,
    pagina: 0,
    tamanio: 20,
    totalElementos: contenido.length,
    totalPaginas: Math.ceil(contenido.length / 20),
    ...overrides
  }
}
