import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ServiceOrderSummary } from "../../domain/models/operations-read.models"
import { ScheduleServiceOrderParams } from "../../domain/params/operations.params"
import { provideOperationsRequestReads } from "../../operations.providers"
import { ServiceOrdersHttpSource } from "./service-orders-http.source"

export const ordersUrl = "https://api.example.test/api/ordenes"
export const scheduleUrl = `${ordersUrl}/17/programacion`
export const reasonsUrl = "https://api.example.test/api/catalogos/motivos-reprogramacion"
export const scheduleInput = (): ScheduleServiceOrderParams => ({
  date: "2024-02-29",
  startTime: "08:15:49.123456789",
  endTime: null,
  reasonId: null
})

// Flat OrdenResponse, not the detail/property/history projection.
export const scheduledOrderDto = () => ({
  idOrden: 17,
  codigo: "OS-2026-000017",
  estado: "PENDIENTE",
  estadoNombre: "Pendiente",
  idSolicitud: 42,
  idCliente: 8,
  cliente: "Stored customer",
  idPropiedad: 31,
  propiedad: "Stored property",
  idTipoServicio: 4,
  tipoServicio: "Stored service",
  duracionEstimadaMinutos: 90,
  montoEstimado: 0,
  observacion: "  <b>Literal</b>  ",
  programacion: {
    idProgramacion: 51,
    fecha: "2024-02-29",
    horaInicio: "08:15:00",
    horaFin: "09:45:00",
    vigente: true,
    motivo: null,
    registradoPor: "Stored actor",
    fechaRegistro: "2026-03-02T04:30:00-05:00"
  },
  asignados: [],
  fechaCreacion: "2026-03-02T04:30:00-05:00",
  fechaActualizacion: null
})

export const scheduledOrderSummary = (): ServiceOrderSummary => ({
  id: 17,
  code: "OS-2026-000017",
  status: "PENDIENTE",
  statusName: "Pendiente",
  requestId: 42,
  customerId: 8,
  customerName: "Stored customer",
  propertyId: 31,
  propertyName: "Stored property",
  serviceTypeId: 4,
  serviceTypeName: "Stored service",
  estimatedDurationMinutes: 90,
  estimatedAmount: "0.00",
  observation: "  <b>Literal</b>  ",
  schedule: {
    id: 51,
    date: "2024-02-29",
    startTime: "08:15:00",
    endTime: "09:45:00",
    isCurrent: true,
    reasonName: null,
    registeredByName: "Stored actor",
    registeredAt: new Date("2026-03-02T09:30:00Z")
  },
  assignedStaff: [],
  createdAt: new Date("2026-03-02T09:30:00Z"),
  updatedAt: null
})

export function setupScheduling(server = false, api: string | null = "https://api.example.test") {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideOperationsRequestReads(),
      { provide: PLATFORM_ID, useValue: server ? "server" : "browser" },
      { provide: API_URL, useValue: api }
    ]
  })
  return {
    source: TestBed.inject(ServiceOrdersHttpSource),
    http: TestBed.inject(HttpTestingController)
  }
}
