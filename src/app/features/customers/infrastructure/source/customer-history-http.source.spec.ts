import { TestBed } from "@angular/core/testing"
import { PLATFORM_ID } from "@angular/core"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom } from "rxjs"
import { describe, it, expect } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { CustomerHistoryHttpSource } from "./customer-history-http.source"

const stamp = "2026-01-01T00:00:00Z",
  date = new Date(stamp)
const customer = {
  idCliente: 7,
  nombre: "Customer",
  tipo: "residencial",
  correo: null,
  telefono: null,
  activo: true,
  idUsuario: null,
  fechaCreacion: stamp,
  fechaActualizacion: null,
  idProspecto: null,
  identificacionFiscal: null,
  sistemaOrigen: null,
  idExterno: null,
  usuarioRegistro: 9
}
const page = (contenido: unknown[], total = contenido.length) => ({
  contenido,
  pagina: 0,
  tamanio: 1,
  totalElementos: total,
  totalPaginas: total
})
const request = {
  idSolicitud: 1,
  idCliente: 7,
  cliente: "Customer",
  idPropiedad: 6,
  propiedad: "Home",
  idTipoServicio: 2,
  tipoServicio: "Clean",
  descripcion: null,
  fechaDeseada: "2026-02-28",
  estado: "registrada",
  registradoPor: null,
  fechaRegistro: stamp,
  fechaActualizacion: null
}
const order = {
  idOrden: 3,
  codigo: "ORD-3",
  estado: "PROGRAMADA",
  estadoNombre: "Programada",
  idSolicitud: 1,
  idCliente: 7,
  cliente: "Customer",
  idPropiedad: 6,
  propiedad: "Home",
  idTipoServicio: 2,
  tipoServicio: "Clean",
  duracionEstimadaMinutos: 60,
  montoEstimado: 99999999.99,
  observacion: null,
  programacion: {
    idProgramacion: 8,
    fecha: "2026-02-28",
    horaInicio: "09:00:00",
    horaFin: "10:00:00",
    vigente: true,
    motivo: null,
    registradoPor: null,
    fechaRegistro: stamp
  },
  asignados: [{ idPersonal: 9, nombre: "Field", telefono: null, rol: "RESPONSABLE" }],
  fechaCreacion: stamp,
  fechaActualizacion: null
}
const support = {
  idAtencion: 4,
  idCliente: 7,
  cliente: "Customer",
  idOrden: null,
  codigoOrden: null,
  idTipo: 2,
  tipo: "Consulta",
  requiereRespuesta: false,
  estado: "RECIBIDA",
  estadoNombre: "Recibida",
  asunto: "Subject",
  descripcion: "Description",
  fechaRegistro: stamp,
  fechaCierre: null
}
const dto = {
  cliente: customer,
  solicitudes: page([request], 12),
  ordenes: page([order], 8),
  atenciones: page([support], 3)
}
function setup(platform = "browser", origin: string | null = "http://localhost:8080") {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: origin },
      { provide: PLATFORM_ID, useValue: platform }
    ]
  })
}
describe("RF12 actual history projection", () => {
  it("preserves every response field, nested schedule/team, redaction nulls and separate totals", async () => {
    setup()
    const pending = firstValueFrom(TestBed.inject(CustomerHistoryHttpSource).getHistory(7, 1))
    const http = TestBed.inject(HttpTestingController),
      req = http.expectOne("http://localhost:8080/api/clientes/7/historial?tamanio=1")
    expect(req.request.method).toBe("GET")
    expect(req.request.transferCache).toBe(false)
    req.flush(dto)
    expect(await pending).toEqual({
      success: true,
      data: {
        customer: {
          id: 7,
          name: "Customer",
          type: "residencial",
          email: null,
          phone: null,
          isActive: true,
          userId: null,
          createdAt: date,
          updatedAt: null,
          leadId: null,
          taxIdentification: null,
          systemOrigin: null,
          externalId: null,
          registeredByUserId: 9
        },
        requests: {
          items: [
            {
              id: 1,
              customerId: 7,
              customer: "Customer",
              propertyId: 6,
              property: "Home",
              serviceTypeId: 2,
              serviceType: "Clean",
              description: null,
              desiredDate: "2026-02-28",
              status: "registrada",
              registeredBy: null,
              registeredAt: date,
              updatedAt: null
            }
          ],
          total: 12,
          offset: 0,
          limit: 1
        },
        orders: {
          items: [
            {
              id: 3,
              code: "ORD-3",
              status: "PROGRAMADA",
              statusName: "Programada",
              requestId: 1,
              customerId: 7,
              customer: "Customer",
              propertyId: 6,
              property: "Home",
              serviceTypeId: 2,
              serviceType: "Clean",
              estimatedMinutes: 60,
              estimatedAmount: "99999999.99",
              observation: null,
              schedule: {
                id: 8,
                date: "2026-02-28",
                startTime: "09:00:00",
                endTime: "10:00:00",
                isCurrent: true,
                reason: null,
                registeredBy: null,
                registeredAt: date
              },
              assignees: [{ id: 9, name: "Field", phone: null, role: "RESPONSABLE" }],
              createdAt: date,
              updatedAt: null
            }
          ],
          total: 8,
          offset: 0,
          limit: 1
        },
        support: {
          items: [
            {
              id: 4,
              customerId: 7,
              customer: "Customer",
              orderId: null,
              orderCode: null,
              typeId: 2,
              type: "Consulta",
              requiresResponse: false,
              status: "RECIBIDA",
              statusName: "Recibida",
              subject: "Subject",
              description: "Description",
              registeredAt: date,
              closedAt: null
            }
          ],
          total: 3,
          offset: 0,
          limit: 1
        }
      }
    })
    http.verify()
  })
  it("preserves actual restricted empty pages independently, without a combined total or permission inference", async () => {
    setup()
    const pending = firstValueFrom(TestBed.inject(CustomerHistoryHttpSource).getHistory(7, 1))
    const http = TestBed.inject(HttpTestingController)
    http
      .expectOne(() => true)
      .flush({
        ...dto,
        solicitudes: page([]),
        ordenes: page([
          {
            ...order,
            montoEstimado: null,
            idSolicitud: null,
            idTipoServicio: null,
            tipoServicio: null,
            duracionEstimadaMinutos: null,
            programacion: null
          }
        ]),
        atenciones: page([])
      })
    expect(await pending).toMatchObject({
      success: true,
      data: {
        requests: { total: 0, items: [] },
        orders: {
          total: 1,
          items: [
            {
              estimatedAmount: null,
              requestId: null,
              serviceTypeId: null,
              serviceType: null,
              estimatedMinutes: null,
              schedule: null
            }
          ]
        },
        support: { total: 0, items: [] }
      }
    })
    http.verify()
  })
  it.each([403, 404, 500])("does not fabricate aggregate success on HTTP %s", async status => {
    setup()
    const pending = firstValueFrom(TestBed.inject(CustomerHistoryHttpSource).getHistory(7))
    const http = TestBed.inject(HttpTestingController)
    http.expectOne(() => true).flush(null, { status, statusText: "Failure" })
    expect(await pending).toMatchObject({
      success: false,
      error: {
        code: status === 403 ? "FORBIDDEN" : status === 404 ? "CUSTOMER_NOT_FOUND" : "UNEXPECTED"
      }
    })
    http.verify()
  })
  it.each([
    ["solicitudes", request],
    ["ordenes", order],
    ["atenciones", support]
  ])(
    "rejects the entire history when a %s item belongs to another customer",
    async (module, item) => {
      setup()
      const pending = firstValueFrom(TestBed.inject(CustomerHistoryHttpSource).getHistory(7, 1))
      const http = TestBed.inject(HttpTestingController),
        req = http.expectOne("http://localhost:8080/api/clientes/7/historial?tamanio=1")
      expect(req.request.method).toBe("GET")
      expect(req.request.transferCache).toBe(false)
      req.flush({ ...dto, [module]: page([{ ...item, idCliente: 8 }]) })
      const result = await pending
      http.expectNone(() => true)
      http.verify()
      expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
      expect(result).not.toHaveProperty("data")
    }
  )
  it("rejects wrong customer, missing module page, bad calendar or impossible page metadata", async () => {
    setup()
    const source = TestBed.inject(CustomerHistoryHttpSource),
      http = TestBed.inject(HttpTestingController)
    for (const invalid of [
      { ...dto, cliente: { ...customer, idCliente: 8 } },
      { ...dto, atenciones: null },
      { ...dto, solicitudes: page([{ ...request, fechaDeseada: "2026-02-30" }]) },
      { ...dto, ordenes: { ...dto.ordenes, totalPaginas: 9 } }
    ]) {
      const pending = firstValueFrom(source.getHistory(7, 1))
      http.expectOne(() => true).flush(invalid)
      expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    }
    http.verify()
  })
  it.each([
    ["server", "http://localhost:8080"],
    ["browser", null]
  ])("dispatches no history on %s with origin %s", async (platform, origin) => {
    setup(platform!, origin)
    expect(
      await firstValueFrom(TestBed.inject(CustomerHistoryHttpSource).getHistory(7))
    ).toMatchObject({ success: false, error: { code: "UNCONFIGURED" } })
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
