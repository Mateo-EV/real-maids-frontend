import { TestBed } from "@angular/core/testing"
import { PLATFORM_ID } from "@angular/core"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { FieldStaffQuery } from "../../domain/params/field-operations.params"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom, of } from "rxjs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { FieldStaffHttpSource } from "./field-staff-http.source"

const dto = {
  idPersonal: 7,
  nombre: "Staff",
  documento: "DOC-7",
  telefono: null,
  correo: null,
  idioma: "es",
  fechaIngreso: "2024-02-29",
  activo: false,
  idUsuario: 19,
  disponibilidad: [{ dia: "LUNES", horaInicio: "08:15:30.123456789", horaFin: "17:45" }],
  fechaCreacion: "2026-01-01T12:00:00-05:00"
}
const wirePage = (
  contenido: unknown[] = [dto],
  pagina = 0,
  tamanio = 20,
  totalElementos = contenido.length
) => ({
  contenido,
  pagina,
  tamanio,
  totalElementos,
  totalPaginas: Math.ceil(totalElementos / tamanio)
})
describe("Staff HTTP reads", () => {
  let source: FieldStaffHttpSource, http: HttpTestingController
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" },
        {
          provide: ObserveAuthSessionUseCase,
          useValue: {
            execute: () => of(AuthSession.create("Caller", "caller@example.test", null, null, 19))
          }
        }
      ]
    })
    source = TestBed.inject(FieldStaffHttpSource)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())
  it("reads exactly one server page with default paging and preserves the public projection", async () => {
    const pending = firstValueFrom(source.getStaff())
    const request = http.expectOne("http://localhost:8080/api/personal?pagina=0&tamanio=20")
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    request.flush(wirePage())
    expect(await pending).toEqual({
      success: true,
      data: {
        total: 1,
        offset: 0,
        limit: 20,
        items: [
          {
            id: 7,
            name: "Staff",
            document: "DOC-7",
            phone: null,
            email: null,
            language: "es",
            joinedOn: "2024-02-29",
            isActive: false,
            userId: 19,
            availability: [{ weekday: "LUNES", startTime: "08:15:30.123456789", endTime: "17:45" }],
            createdAt: new Date("2026-01-01T17:00:00Z")
          }
        ]
      }
    })
  })
  it("snapshots, trims and transports name/document search literally, retaining active false", async () => {
    const query = { search: "  A_% &+O'  ", isActive: false, offset: 40, limit: 20 }
    const read = source.getStaff(query)
    query.search = "Changed"
    const pending = firstValueFrom(read)
    const req = http.expectOne(r => r.url.endsWith("/personal"))
    expect(req.request.params.keys()).toEqual(["pagina", "tamanio", "busqueda", "activo"])
    expect(req.request.params.get("busqueda")).toBe("A_% &+O'")
    expect(req.request.params.get("activo")).toBe("false")
    expect(req.request.params.get("pagina")).toBe("2")
    expect(req.request.urlWithParams).toContain("%26%2BO'")
    req.flush(wirePage([dto], 2, 5, 11))
    expect(await pending).toMatchObject({
      success: true,
      data: { offset: 10, limit: 5, total: 11, items: [{ id: 7 }] }
    })
  })
  it.each([
    { query: { offset: 400, limit: 200 }, page: 2, size: 100, total: 0 },
    { query: { offset: 40 }, page: 2, size: 20, total: 1 },
    { query: {}, page: 0, size: 20, total: 0 }
  ])(
    "retains returned effective and out-of-range metadata: $query",
    async ({ query, page, size, total }) => {
      const pending = firstValueFrom(source.getStaff(query))
      http.expectOne(r => r.url.endsWith("/personal")).flush(wirePage([], page, size, total))
      expect(await pending).toMatchObject({
        success: true,
        data: { items: [], offset: page * size, limit: size, total }
      })
    }
  )
  it.each<FieldStaffQuery>([
    { offset: -1 },
    { offset: 1 },
    { limit: 0 },
    { limit: 1.5 },
    { limit: 2147483648 },
    { offset: 2147483648, limit: 1 },
    { offset: Number.MAX_SAFE_INTEGER + 1 },
    { offset: NaN },
    { limit: Infinity }
  ])("rejects invalid paging without HTTP: %j", async query => {
    expect(await firstValueFrom(source.getStaff(query))).toMatchObject({
      success: false,
      error: { code: "INVALID_DATA" }
    })
    http.expectNone(() => true)
  })
  it.each([
    { pagina: 1 },
    { tamanio: 0 },
    { tamanio: 21 },
    { tamanio: 101 },
    { totalElementos: -1 },
    { totalElementos: 1.5 },
    { totalPaginas: 0 },
    { contenido: [dto, dto], totalElementos: 2 },
    { contenido: [] },
    { pagina: "0" },
    { totalElementos: Number.MAX_SAFE_INTEGER + 1 }
  ])("rejects inconsistent/duplicate page data: %j", async patch => {
    const pending = firstValueFrom(source.getStaff())
    http.expectOne(r => r.url.endsWith("/personal")).flush({ ...wirePage(), ...patch })
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })
  it("reads detail and me exactly, preserves nulls and empty weekly restrictions, not caller-as-staff identity", async () => {
    const detail = firstValueFrom(source.getStaffById(7))
    const request = http.expectOne("http://localhost:8080/api/personal/7")
    expect(request.request.transferCache).toBe(false)
    request.flush({ ...dto, fechaIngreso: null, idUsuario: null, disponibilidad: [] })
    expect(await detail).toMatchObject({
      success: true,
      data: { id: 7, joinedOn: null, userId: null, availability: [] }
    })
    const me = firstValueFrom(source.getMyStaffProfile())
    const own = http.expectOne("http://localhost:8080/api/personal/me")
    expect(own.request.transferCache).toBe(false)
    own.flush(dto)
    expect(await me).toMatchObject({ success: true, data: { id: 7, userId: 19 } })
  })
  it("rejects mismatched requested or caller identities", async () => {
    const detail = firstValueFrom(source.getStaffById(8))
    http.expectOne("http://localhost:8080/api/personal/8").flush(dto)
    expect(await detail).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    const me = firstValueFrom(source.getMyStaffProfile())
    http.expectOne("http://localhost:8080/api/personal/me").flush({ ...dto, idUsuario: 20 })
    expect(await me).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })
  it.each([0, -1, 1.5, 2147483648, NaN])("rejects invalid target %s without HTTP", async id => {
    expect(await firstValueFrom(source.getStaffById(id))).toMatchObject({
      success: false,
      error: { code: "INVALID_DATA" }
    })
    http.expectNone(() => true)
  })
  it.each([
    { nombre: null },
    { nombre: "x".repeat(151) },
    { documento: null },
    { documento: "x".repeat(31) },
    { idioma: null },
    { idioma: "x".repeat(6) },
    { activo: null },
    { fechaCreacion: null },
    { telefono: "x".repeat(31) },
    { correo: "x".repeat(121) },
    { idUsuario: 0 },
    { fechaIngreso: "2025-02-29" },
    { fechaIngreso: "2024-04-31" },
    { fechaIngreso: "2024-13-01" },
    { fechaIngreso: "2024-02-29T00:00:00Z" },
    { fechaCreacion: "2026-01-01T12:00:00" },
    { fechaCreacion: "2026-02-30T12:00:00Z" },
    { fechaCreacion: "2026-01-01T24:00:00Z" },
    { fechaCreacion: "2026-01-01T12:60:00Z" },
    { fechaCreacion: "2026-01-01T12:00:00+19:00" },
    { disponibilidad: null },
    { disponibilidad: [{ dia: "MONDAY", horaInicio: "08:00", horaFin: "09:00" }] },
    { disponibilidad: [{ dia: "LUNES", horaInicio: "24:00", horaFin: "09:00" }] },
    { disponibilidad: [{ dia: "LUNES", horaInicio: "08:00:60", horaFin: "09:00" }] },
    { disponibilidad: [{ dia: "LUNES", horaInicio: "08:00:00.1234567890", horaFin: "09:00" }] }
  ])("rejects malformed staff data without raw details: %j", async patch => {
    const pending = firstValueFrom(source.getStaffById(7))
    http.expectOne("http://localhost:8080/api/personal/7").flush({ ...dto, ...patch })
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })
  it.each(Object.keys(dto))("rejects a missing required projection member: %s", async key => {
    const incomplete: Record<string, unknown> = { ...dto }
    delete incomplete[key]
    const pending = firstValueFrom(source.getStaffById(7))
    http.expectOne("http://localhost:8080/api/personal/7").flush(incomplete)
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })
  it("preserves all wire weekdays and supplied slot order/time precision", async () => {
    const days = ["DOMINGO", "SABADO", "VIERNES", "JUEVES", "MIERCOLES", "MARTES", "LUNES"]
    const pending = firstValueFrom(source.getStaffById(7))
    const request = http.expectOne("http://localhost:8080/api/personal/7")
    request.flush({
      ...dto,
      disponibilidad: days.map(dia => ({
        dia,
        horaInicio: "01:02:03.000000001",
        horaFin: "09:00:00"
      }))
    })
    expect(await pending).toMatchObject({
      success: true,
      data: {
        availability: days.map(weekday => ({
          weekday,
          startTime: "01:02:03.000000001",
          endTime: "09:00:00"
        }))
      }
    })
  })
  it.each([
    [0, "UNAVAILABLE"],
    [400, "INVALID_DATA"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [405, "UNSUPPORTED"],
    [409, "CONFLICT"],
    [500, "UNKNOWN"]
  ])("maps HTTP %s safely", async (status, code) => {
    const pending = firstValueFrom(source.getStaffById(7))
    const request = http.expectOne("http://localhost:8080/api/personal/7")
    request.flush(
      { mensaje: "private backend detail" },
      { status: Number(status), statusText: "Failure" }
    )
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    expect(result.success ? "" : result.error.message).not.toContain("private")
  })
})

describe("Staff transport preflight", () => {
  it.each([
    null,
    "https://user:password@api.example.test",
    "https://api.example.test/api",
    "https://api.example.test?query=1",
    "http://untrusted.test"
  ])("rejects unconfigured or unsafe API %s without HTTP", async api => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: api }
      ]
    })
    expect(await firstValueFrom(TestBed.inject(FieldStaffHttpSource).getStaff())).toMatchObject({
      success: false,
      error: { code: "UNCONFIGURED" }
    })
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
  it("dispatches no SSR requests, including me auth observation", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "https://api.example.test" },
        { provide: PLATFORM_ID, useValue: "server" }
      ]
    })
    const source = TestBed.inject(FieldStaffHttpSource)
    for (const request of [source.getStaff(), source.getStaffById(7), source.getMyStaffProfile()]) {
      expect(await firstValueFrom<unknown>(request)).toMatchObject({
        success: false,
        error: { code: "UNCONFIGURED" }
      })
    }
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
