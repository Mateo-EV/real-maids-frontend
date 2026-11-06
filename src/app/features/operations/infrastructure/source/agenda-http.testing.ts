import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { AgendaEntry } from "../../domain/models/operations-read.models"
import { AgendaQuery } from "../../domain/params/operations.params"
import { AgendaHttpSource } from "./agenda-http.source"

export const agendaUrl = "https://api.example.test/api/agenda"
export const agendaQuery = (): AgendaQuery => ({ from: "2024-02-29", until: "2024-03-01" })

export function setupAgenda(
  platform = "browser",
  origin: string | null = "https://api.example.test"
) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: platform },
      { provide: API_URL, useValue: origin }
    ]
  })
  return { source: TestBed.inject(AgendaHttpSource), http: TestBed.inject(HttpTestingController) }
}

interface AgendaDtoFixture {
  fecha: string
  horaInicio: string
  horaFin: string | null
  idOrden: number
  codigo: string
  estado: string
  cliente: string
  propiedad: string
  tipoServicio: string | null
  asignados: { idPersonal: number; nombre: string; telefono: string | null; rol: string }[]
}

export const agendaDto = (): AgendaDtoFixture => ({
  fecha: "2024-02-29",
  horaInicio: "08:15:49.123456789",
  horaFin: null,
  idOrden: 17,
  codigo: "  OS-17  ",
  estado: "FUTURE_STATE",
  cliente: "  Synthetic customer  ",
  propiedad: "  Synthetic property  ",
  tipoServicio: null,
  asignados: [{ idPersonal: 9, nombre: "  Synthetic staff  ", telefono: null, rol: "FUTURE_ROLE" }]
})

// Typed nullable projection: no domain assertions or fabricated fallback labels.
export const agendaEntry = (): AgendaEntry => ({
  date: "2024-02-29",
  startTime: "08:15:49.123456789",
  endTime: null,
  orderId: 17,
  code: "  OS-17  ",
  status: "FUTURE_STATE",
  customerName: "  Synthetic customer  ",
  propertyName: "  Synthetic property  ",
  serviceTypeName: null,
  assignedStaff: [{ staffId: 9, name: "  Synthetic staff  ", phone: null, role: "FUTURE_ROLE" }]
})

export function corruptQuery(field: string, value: unknown): AgendaQuery {
  const query = agendaQuery()
  Reflect.set(query, field, value)
  return query
}

export function corruptQueryShape(value: unknown): AgendaQuery {
  const holder = { query: agendaQuery() }
  Object.defineProperty(holder, "query", { value })
  return holder.query
}
