import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ReportsHttpSource } from "./reports-http.source"

const base = "https://api.example.test"
const catalogUrl = `${base}/api/reportes`
const historyUrl = `${base}/api/reportes/generados`
const reportUrl = `${base}/api/reportes/CLIENTES`

function setup(server = false) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: base },
      { provide: PLATFORM_ID, useValue: server ? "server" : "browser" }
    ]
  })
  return { source: TestBed.inject(ReportsHttpSource), http: TestBed.inject(HttpTestingController) }
}

const catalogWire = () => [
  { tipo: "CLIENTES", titulo: "Clientes", descripcion: "Actividad" },
  { tipo: "ORDENES", titulo: "Órdenes", descripcion: "Órdenes" }
]

const itemWire = (id = 4) => ({
  idReporte: id,
  tipo: "CLIENTES",
  formato: "JSON",
  parametros: null,
  usuario: "Caller",
  fechaGeneracion: "2026-02-11T09:15:00-05:00"
})

const pageWire = (overrides: Record<string, unknown> = {}) => ({
  contenido: [itemWire()],
  pagina: 0,
  tamanio: 20,
  totalElementos: 1,
  totalPaginas: 1,
  ...overrides
})

const tableWire = (overrides: Record<string, unknown> = {}) => ({
  tipo: "CLIENTES",
  titulo: "Clientes",
  desde: "2026-01-01",
  hasta: "2026-01-31",
  generadoEn: "2026-02-11T09:15:00-05:00",
  columnas: ["Cliente", "Servicios"],
  filas: [
    ["Ana", 3],
    [null, 0]
  ],
  ...overrides
})

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    TestBed.resetTestingModule()
  }
})

describe("ReportsHttpSource catalog and history", () => {
  it("reads the type catalog and the paged history of generated reports", async () => {
    const { source, http } = setup()
    const types = firstValueFrom(source.getReportTypes())
    const catalog = http.expectOne(request => request.url === catalogUrl)
    expect(catalog.request.method).toBe("GET")
    expect(catalog.request.transferCache).toBe(false)
    expect(catalog.request.params.keys()).toEqual([])
    catalog.flush(catalogWire())
    const catalogResult = await types
    expect(catalogResult.success && catalogResult.data.map(type => type.type)).toEqual([
      "CLIENTES",
      "ORDENES"
    ])

    const history = firstValueFrom(source.getGeneratedReports({ offset: 40, limit: 20 }))
    const page = http.expectOne(request => request.url === historyUrl)
    expect(page.request.transferCache).toBe(false)
    expect([page.request.params.get("pagina"), page.request.params.get("tamanio")]).toEqual([
      "2",
      "20"
    ])
    page.flush(pageWire({ pagina: 2, totalElementos: 41, totalPaginas: 3 }))
    const historyResult = await history
    expect(historyResult.success && historyResult.data).toEqual({
      items: [
        {
          id: 4,
          type: "CLIENTES",
          format: "JSON",
          parameters: null,
          userName: "Caller",
          generatedAt: new Date("2026-02-11T09:15:00-05:00")
        }
      ],
      total: 41,
      offset: 40,
      limit: 20
    })
  })

  it("refuses an unusable page and a server page that is not the requested one", async () => {
    const { source, http } = setup()
    const refused = await firstValueFrom(source.getGeneratedReports({ offset: 30, limit: 20 }))
    expect(refused.success).toBe(false)
    expect(!refused.success && refused.error.code).toBe("VALIDATION")
    http.expectNone(() => true)

    const mismatched = firstValueFrom(source.getGeneratedReports({ offset: 0, limit: 20 }))
    http.expectOne(request => request.url === historyUrl).flush(pageWire({ tamanio: 50 }))
    const result = await mismatched
    expect(!result.success && result.error.code).toBe("INVALID_RESPONSE")
  })

  it("rejects unknown catalog shapes and duplicated types", async () => {
    const { source, http } = setup()
    for (const body of [
      [{ tipo: "CLIENTES", titulo: "Clientes" }],
      [{ tipo: "  ", titulo: "Clientes", descripcion: "Actividad" }],
      [{ tipo: 7, titulo: "Clientes", descripcion: "Actividad" }],
      cableDuplicated(),
      { contenido: [] }
    ]) {
      const read = firstValueFrom(source.getReportTypes())
      http.expectOne(request => request.url === catalogUrl).flush(body)
      const result = await read
      expect(result.success, JSON.stringify(body)).toBe(false)
      expect(!result.success && result.error.code).toBe("INVALID_RESPONSE")
    }
  })
})

function cableDuplicated() {
  return [
    { tipo: "CLIENTES", titulo: "Clientes", descripcion: "Actividad" },
    { tipo: "CLIENTES", titulo: "Clientes otra vez", descripcion: "Duplicado" }
  ]
}

describe("ReportsHttpSource generation", () => {
  it("sends only the chosen type and period and decodes the table in document order", async () => {
    const { source, http } = setup()
    const read = firstValueFrom(
      source.generateReport({ type: "CLIENTES", from: "2026-01-01", to: "2026-01-31" })
    )
    const request = http.expectOne(candidate => candidate.url === reportUrl)
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    expect([request.request.params.get("desde"), request.request.params.get("hasta")]).toEqual([
      "2026-01-01",
      "2026-01-31"
    ])
    request.flush(tableWire())
    const result = await read
    expect(result.success && result.data).toEqual({
      type: "CLIENTES",
      title: "Clientes",
      from: "2026-01-01",
      to: "2026-01-31",
      generatedAt: new Date("2026-02-11T09:15:00-05:00"),
      columns: ["Cliente", "Servicios"],
      rows: [
        ["Ana", 3],
        [null, 0]
      ]
    })
  })

  it("omits a blank period instead of sending an empty value", async () => {
    const { source, http } = setup()
    const read = firstValueFrom(source.generateReport({ type: "CLIENTES", from: "", to: "  " }))
    const request = http.expectOne(candidate => candidate.url === reportUrl)
    expect(request.request.params.keys()).toEqual([])
    request.flush(tableWire())
    expect((await read).success).toBe(true)
  })

  it("refuses an unusable period or a blank type before dispatching", async () => {
    const { source, http } = setup()
    for (const params of [
      { type: "CLIENTES", from: "2026-02-30" },
      { type: "CLIENTES", from: "2026-02-10", to: "2026-02-01" },
      { type: "   " }
    ]) {
      const result = await firstValueFrom(source.generateReport(params))
      expect(!result.success && result.error.code, JSON.stringify(params)).toBe("VALIDATION")
    }
    http.expectNone(() => true)
  })

  it("rejects an unknown type in the answer and malformed cells", async () => {
    const { source, http } = setup()
    for (const body of [
      tableWire({ tipo: "OTRO" }),
      tableWire({ columnas: [] }),
      tableWire({ columnas: ["Cliente", "Cliente"] }),
      tableWire({ filas: [["Ana"]] }),
      tableWire({ filas: [["Ana", { nested: true }]] }),
      tableWire({ filas: [["Ana", ["array"]]] }),
      tableWire({ filas: [["Ana", null, "sobra"]] }),
      tableWire({ desde: "2026-13-01" }),
      tableWire({ generadoEn: "2026-02-11" })
    ]) {
      const read = firstValueFrom(source.generateReport({ type: "CLIENTES" }))
      http.expectOne(candidate => candidate.url === reportUrl).flush(body)
      const result = await read
      expect(result.success, JSON.stringify(body)).toBe(false)
      expect(!result.success && result.error.code).toBe("INVALID_RESPONSE")
    }
  })

  it("maps a forbidden generation to FORBIDDEN and dispatches nothing on the server", async () => {
    const { source, http } = setup()
    const read = firstValueFrom(source.generateReport({ type: "CLIENTES" }))
    http
      .expectOne(candidate => candidate.url === reportUrl)
      .flush("forbidden", { status: 403, statusText: "Forbidden" })
    const result = await read
    expect(!result.success && result.error.code).toBe("FORBIDDEN")

    TestBed.resetTestingModule()
    const server = setup(true)
    const offline = await firstValueFrom(server.source.generateReport({ type: "CLIENTES" }))
    expect(!offline.success && offline.error.code).toBe("NETWORK")
    server.http.expectNone(() => true)
  })
})
