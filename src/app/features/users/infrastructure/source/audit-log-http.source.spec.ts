import { PLATFORM_ID } from "@angular/core"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { AuditLogHttpSource } from "./audit-log-http.source"
import { AuditLogRepositoryImpl } from "../repositories/audit-log.repository-impl"

const event = {
  idLog: 9,
  idUsuario: 2,
  correoUsuario: "actor@example.test",
  nombreUsuario: "Actor de prueba",
  entidad: "usuario",
  idRegistro: 3,
  accion: "ACTUALIZAR",
  detalle: "Prueba sintética",
  cambios: [{ campo: "nombre", antes: "Anterior", despues: "Nuevo" }],
  ip: "192.0.2.1",
  fecha: "2026-09-01T23:59:59Z"
}
const page = {
  contenido: [event],
  pagina: 0,
  tamanio: 5,
  totalElementos: 7,
  totalPaginas: 2,
  totalGlobal: 90
}

describe("Real audit HTTP repository", () => {
  let http: HttpTestingController
  let repository: AuditLogRepositoryImpl
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" },
        { provide: PLATFORM_ID, useValue: "browser" }
      ]
    })
    http = TestBed.inject(HttpTestingController)
    repository = TestBed.inject(AuditLogRepositoryImpl)
  })
  afterEach(() => http.verify())
  it("uses the real endpoint and server filtered total, not demo rows", async () => {
    const result = firstValueFrom(repository.getAuditLogs({ entity: "usuario", limit: 5 }))
    const request = http.expectOne(r => r.url === "http://localhost:8080/api/auditoria")
    expect(request.request.params.get("entidad")).toBe("usuario")
    expect(request.request.params.get("pagina")).toBe("0")
    expect(request.request.params.get("tamanio")).toBe("5")
    request.flush(page)
    expect(await result).toMatchObject({
      success: true,
      data: {
        total: 7,
        globalTotal: 90,
        items: [{ id: 9, actor: "Actor de prueba", recordId: "3" }]
      }
    })
  })
  it("maps every actor/range filter including both UTC endpoints and preserves open codes", async () => {
    const filters = {
      userId: 2,
      fromUTC: "2026-09-01",
      toUTC: "2026-09-02",
      entity: "backend_nueva",
      action: "ACCION_NUEVA",
      page: 1,
      size: 5
    }
    const result = firstValueFrom(repository.getAuditLogs(filters))
    filters.fromUTC = "2026-10-01"
    const request = http.expectOne(r => r.url.endsWith("/api/auditoria"))
    expect(
      Object.fromEntries(request.request.params.keys().map(k => [k, request.request.params.get(k)]))
    ).toEqual({
      idUsuario: "2",
      desde: "2026-09-01",
      hasta: "2026-09-02",
      entidad: "backend_nueva",
      accion: "ACCION_NUEVA",
      pagina: "1",
      tamanio: "5"
    })
    expect(request.request.transferCache).toBe(false)
    request.flush({ ...page, pagina: 1 })
    expect(await result).toMatchObject({
      success: true,
      data: { page: 1, size: 5, total: 7, globalTotal: 90 }
    })
  })
  it("maps legacy single-day reads to equal inclusive endpoints", async () => {
    const result = firstValueFrom(repository.getAuditLogs({ dayUTC: "2026-09-01" }))
    const request = http.expectOne(r => r.url.endsWith("/api/auditoria"))
    expect(request.request.params.get("desde")).toBe("2026-09-01")
    expect(request.request.params.get("hasta")).toBe("2026-09-01")
    request.flush({
      contenido: [],
      pagina: 0,
      tamanio: 20,
      totalElementos: 0,
      totalPaginas: 0,
      totalGlobal: 90
    })
    expect(await result).toMatchObject({ success: true, data: { total: 0, globalTotal: 90 } })
  })
  for (const query of [
    { fromUTC: "2026-02-30" },
    { toUTC: "2026-9-01" },
    { fromUTC: "2026-09-02", toUTC: "2026-09-01" },
    { userId: 1.5 },
    { userId: 2147483648 },
    { entity: "" },
    { action: null },
    { dayUTC: "2026-09-01", fromUTC: "2026-09-01" }
  ]) {
    it(`rejects invalid filters locally: ${JSON.stringify(query)}`, async () => {
      expect(await firstValueFrom(repository.getAuditLogs(query as never))).toMatchObject({
        success: false,
        error: { code: "INVALID_FILTER" }
      })
      http.expectNone(r => r.url.includes("/api/auditoria"))
    })
  }
  for (const query of [
    { page: -1 },
    { page: 0.5 },
    { size: 0 },
    { size: null },
    { offset: 3, limit: 5 },
    { page: 1, offset: 0, size: 5 },
    { size: 5, limit: 2 }
  ]) {
    it(`rejects invalid pagination: ${JSON.stringify(query)}`, async () => {
      expect(await firstValueFrom(repository.getAuditLogs(query as never))).toMatchObject({
        success: false,
        error: { code: "INVALID_PAGINATION" }
      })
    })
  }
  it("returns exact selected detail and explicitly received nulls without fake metadata", async () => {
    const result = firstValueFrom(repository.getAuditLogById(9))
    http.expectOne("http://localhost:8080/api/auditoria/9").flush({
      ...event,
      idUsuario: null,
      nombreUsuario: null,
      correoUsuario: null,
      idRegistro: null,
      detalle: null,
      ip: null,
      cambios: [{ campo: "nombre", antes: null, despues: "Nuevo" }]
    })
    expect(await result).toMatchObject({
      success: true,
      data: {
        id: 9,
        userId: null,
        actor: null,
        actorEmail: null,
        recordId: null,
        details: null,
        ip: null,
        changes: [{ before: null, after: "Nuevo" }]
      }
    })
  })
  for (const patch of [
    { idLog: 10 },
    { idLog: Number.MAX_SAFE_INTEGER + 1 },
    { idUsuario: 2147483648 },
    { idRegistro: 1.5 },
    { fecha: "2026-02-30T00:00:00Z" },
    { fecha: "2026-09-01T24:00:00Z" },
    { fecha: "yesterday" },
    { cambios: null },
    { cambios: [{ campo: "nombre", antes: 3, despues: "Texto" }] },
    { correoUsuario: undefined },
    { nombreUsuario: undefined }
  ]) {
    it(`rejects malformed or inconsistent detail: ${JSON.stringify(patch)}`, async () => {
      const result = firstValueFrom(repository.getAuditLogById(9))
      http.expectOne("http://localhost:8080/api/auditoria/9").flush({ ...event, ...patch })
      expect(await result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    })
  }
  for (const patch of [
    { pagina: 1 },
    { tamanio: 6 },
    { totalGlobal: 6 },
    { totalGlobal: undefined },
    { totalElementos: -1 },
    { totalElementos: Number.MAX_SAFE_INTEGER + 1 },
    { totalPaginas: 3 },
    { contenido: [event, event] },
    { totalElementos: 0, totalPaginas: 0 }
  ]) {
    it(`rejects inconsistent page metadata: ${JSON.stringify(patch)}`, async () => {
      const result = firstValueFrom(repository.getAuditLogs({ size: 5 }))
      http.expectOne(r => r.url.endsWith("/api/auditoria")).flush({ ...page, ...patch })
      expect(await result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    })
  }
  it("exports exactly server CSV bytes with the full filters and no page parameters", async () => {
    const filters = {
      userId: 2,
      entity: "usuario",
      action: "ACTUALIZAR",
      fromUTC: "2026-09-01",
      toUTC: "2026-09-02",
      page: 4,
      size: 5
    }
    const result = firstValueFrom(repository.exportAuditLogs(filters))
    const request = http.expectOne(r => r.url.endsWith("/api/auditoria/exportacion"))
    expect(request.request.responseType).toBe("blob")
    expect(request.request.params.keys().sort()).toEqual([
      "accion",
      "desde",
      "entidad",
      "hasta",
      "idUsuario"
    ])
    expect(request.request.params.get("desde")).toBe("2026-09-01")
    expect(request.request.params.get("hasta")).toBe("2026-09-02")
    const blob = new Blob([new Uint8Array([0xc3, 0xb1, 0x0a])], { type: "text/csv" })
    request.flush(blob, {
      headers: { "Content-Disposition": 'attachment; filename="../../untrusted.csv"' }
    })
    const response = await result
    if (!response.success) throw response.error
    expect(response.data).toBe(blob)
    http.expectNone(r => r.url.endsWith("/api/auditoria"))
  })
  it("rejects an empty export rather than reporting a download", async () => {
    const result = firstValueFrom(repository.exportAuditLogs())
    http.expectOne(r => r.url.endsWith("/api/auditoria/exportacion")).flush(new Blob())
    expect(await result).toMatchObject({ success: false, error: { code: "EXPORT_EMPTY" } })
  })
  for (const [status, code] of [
    [400, "EXPORT_LIMIT"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [500, "UNEXPECTED"]
  ] as const) {
    it(`safely maps simulated blob HTTP ${status} without decoding or leaking the error body`, async () => {
      const result = firstValueFrom(repository.exportAuditLogs({ entity: "usuario" }))
      http
        .expectOne(r => r.url.endsWith("/api/auditoria/exportacion"))
        .flush(new Blob(["Private synthetic error detail"]), { status, statusText: "Simulated" })
      const response = await result
      expect(response).toMatchObject({ success: false, error: { code } })
      if (!response.success) expect(response.error.message).not.toContain("Private")
    })
  }
  it("cancels HTTP when the caller unsubscribes", () => {
    const sub = repository.getAuditLogs().subscribe()
    const request = http.expectOne(r => r.url.endsWith("/api/auditoria"))
    sub.unsubscribe()
    expect(request.cancelled).toBe(true)
  })
  it("never falls back to legacy demo all-row reads", async () => {
    expect(await firstValueFrom(repository.getAllAuditLogs())).toMatchObject({
      success: false,
      error: { code: "UNSUPPORTED" }
    })
    http.expectNone(r => r.url.includes("/api/auditoria"))
  })
  for (const [platform, api] of [
    ["server", "http://localhost:8080"],
    ["browser", null],
    ["browser", "http://unapproved.test"],
    ["browser", "https://user:pass@example.test"]
  ]) {
    it(`fails closed without audit requests for ${platform}/${api}`, async () => {
      TestBed.resetTestingModule()
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: API_URL, useValue: api },
          { provide: PLATFORM_ID, useValue: platform }
        ]
      })
      http = TestBed.inject(HttpTestingController)
      const source = TestBed.inject(AuditLogHttpSource)
      expect(await firstValueFrom(source.getAuditLogs())).toMatchObject({
        success: false,
        error: { code: "UNCONFIGURED" }
      })
      expect(await firstValueFrom(source.getAuditLogById(9))).toMatchObject({
        success: false,
        error: { code: "UNCONFIGURED" }
      })
      expect(await firstValueFrom(source.exportAuditLogs())).toMatchObject({
        success: false,
        error: { code: "UNCONFIGURED" }
      })
      http.expectNone(r => r.url.includes("/api/auditoria"))
    })
  }
})
