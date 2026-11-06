import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ServiceOrderSummary } from "../../domain/models/operations-read.models"
import { ReplaceServiceAssignmentsParams } from "../../domain/params/operations.params"
import { OPERATIONS_REPOSITORY } from "../../domain/repositories/operations.repository"
import { provideOperationsRequestReads } from "../../operations.providers"
import { scheduledOrderDto, scheduledOrderSummary } from "./service-orders-schedule-http.testing"

export const assignmentsUrl = "https://api.example.test/api/ordenes/17/asignaciones"
export const assignmentsInput = (): ReplaceServiceAssignmentsParams => ({
  assignments: [
    { staffId: 6, role: "RESPONSABLE" },
    { staffId: 9, role: "APOYO" }
  ]
})

// Stored roles are not the write DTO enum: ProgramacionService stores lowercase.
// Reuse the frozen flat-order fixture read-only, never the detail wrapper.
export const assignedOrderDto = () => ({
  ...scheduledOrderDto(),
  estado: "PROGRAMADA",
  estadoNombre: "Programada",
  asignados: [
    { idPersonal: 9, nombre: "  Stored support  ", telefono: "", rol: "apoyo" },
    { idPersonal: 6, nombre: "Stored responsible", telefono: null, rol: "responsable" }
  ]
})
export const assignedOrderSummary = (): ServiceOrderSummary => ({
  ...scheduledOrderSummary(),
  status: "PROGRAMADA",
  statusName: "Programada",
  assignedStaff: [
    { staffId: 9, name: "  Stored support  ", phone: "", role: "apoyo" },
    { staffId: 6, name: "Stored responsible", phone: null, role: "responsable" }
  ]
})

export function setupAssignments(server = false, api: string | null = "https://api.example.test") {
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
    repository: TestBed.inject(OPERATIONS_REPOSITORY),
    http: TestBed.inject(HttpTestingController)
  }
}
