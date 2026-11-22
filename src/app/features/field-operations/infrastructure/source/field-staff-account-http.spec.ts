import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { PRESERVE_API_CONFLICT } from "@/app/core/http/api-conflict-context"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { FIELD_OPERATIONS_REPOSITORY } from "../../domain/repositories/field-operations.repository"
import { provideFieldOperationsReads } from "../../field-operations.providers"
import { FieldStaffHttpSource } from "./field-staff-http.source"

const origin = "http://localhost:8080"
const collection = `${origin}/api/personal`
const record = `${collection}/7`

const dto = {
  idPersonal: 7,
  nombre: "Staff",
  documento: "DOC-7",
  telefono: null,
  correo: "staff@example.test",
  idioma: "es",
  fechaIngreso: "2024-02-29",
  activo: true,
  idUsuario: 19 as number | null,
  correoUsuario: "staff@example.test" as string | null,
  disponibilidad: [{ dia: "LUNES", horaInicio: "08:00", horaFin: "12:00" }],
  fechaCreacion: "2026-01-01T12:00:00Z"
}

const base = {
  name: "  Staff Nuevo  ",
  document: "DOC-9",
  phone: null,
  email: "nuevo@example.test",
  language: "es",
  joinedOn: "2024-02-29"
}

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: origin }
    ]
  })
  return {
    source: TestBed.inject(FieldStaffHttpSource),
    http: TestBed.inject(HttpTestingController)
  }
}

describe("staff write transport — the account is created with the record", () => {
  let source: FieldStaffHttpSource, http: HttpTestingController
  beforeEach(() => {
    const app = setup()
    source = app.source
    http = app.http
  })
  afterEach(() => http.verify())

  it("posts only PersonalRequest fields and the account tri-state, never linking metadata", async () => {
    const pending = firstValueFrom(
      source.createStaff({ ...base, createAccount: true, password: " Clave1234 " })
    )
    const request = http.expectOne(collection)
    expect(request.request.method).toBe("POST")
    expect(request.request.body).toEqual({
      nombre: "  Staff Nuevo  ",
      documento: "DOC-9",
      telefono: null,
      correo: "nuevo@example.test",
      idioma: "es",
      fechaIngreso: "2024-02-29",
      crearCuenta: true,
      // Password bytes are never trimmed or transformed.
      password: " Clave1234 "
    })
    expect(request.request.transferCache).toBe(false)
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(true)
    request.flush(dto)
    expect(await pending).toMatchObject({
      success: true,
      data: { id: 7, userId: 19, accountEmail: "staff@example.test" }
    })
  })

  it("omits crearCuenta and password when the account is untouched", async () => {
    const pending = firstValueFrom(source.updateStaff(7, { ...base }))
    const request = http.expectOne(record)
    expect(request.request.method).toBe("PUT")
    expect(Object.keys(request.request.body)).toEqual([
      "nombre",
      "documento",
      "telefono",
      "correo",
      "idioma",
      "fechaIngreso"
    ])
    request.flush(dto)
    expect(await pending).toMatchObject({ success: true, data: { id: 7 } })
  })

  it("sends crearCuenta false and no password when the access is retired", async () => {
    const pending = firstValueFrom(source.updateStaff(7, { ...base, createAccount: false }))
    const request = http.expectOne(record)
    expect(request.request.body).toMatchObject({ crearCuenta: false })
    expect(Object.keys(request.request.body)).not.toContain("password")
    request.flush({ ...dto, idUsuario: 19, correoUsuario: null })
    expect(await pending).toMatchObject({ success: true, data: { accountEmail: null } })
  })

  it.each([
    [{ createAccount: true }],
    [{ createAccount: true, password: "Clave1234", email: null }],
    [{ password: "Clave1234" }],
    [{ createAccount: false, password: "Clave1234" }],
    [{ password: "" }],
    [{ email: "sin-arroba" }],
    [{ phone: "123" }],
    [{ document: "X" }],
    [{ language: "fr" }],
    [{ name: "  " }],
    [{ joinedOn: "2024-02-30" }]
  ])("refuses %p before any dispatch", async patch => {
    const result = await firstValueFrom(
      source.createStaff({ ...base, ...patch } as unknown as Parameters<
        typeof source.createStaff
      >[0])
    )
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    http.expectNone(() => true)
  })

  it("snapshots the caller's input at call time, ignoring later mutation", async () => {
    const params: Record<string, unknown> = { ...base, createAccount: true, password: "Clave1234" }
    const read = source.createStaff(params as unknown as Parameters<typeof source.createStaff>[0])
    params["password"] = "Otra1234"
    const pending = firstValueFrom(read)
    const request = http.expectOne(collection)
    expect(request.request.body).toMatchObject({ password: "Clave1234" })
    request.flush(dto)
    expect((await pending).success).toBe(true)
  })

  it.each([0, -1, 1.5, 2147483648, NaN, "7", null, undefined])(
    "rejects staff target %p before dispatch",
    async id => {
      const result = await firstValueFrom(source.updateStaff(id as unknown as number, { ...base }))
      expect(result).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
      http.expectNone(() => true)
    }
  )

  it("rejects a response that does not describe the written staff record", async () => {
    const pending = firstValueFrom(source.updateStaff(7, { ...base }))
    http.expectOne(record).flush({ ...dto, idPersonal: 8 })
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })

  it.each([
    [{ correoParaCuenta: "x" }, "ACCOUNT_EMAIL_REQUIRED"],
    [{ passwordParaCuenta: "x" }, "ACCOUNT_PASSWORD_REQUIRED"],
    [{ passwordSoloConCuenta: "x" }, "ACCOUNT_PASSWORD_WITHOUT_ACCOUNT"],
    [{ correo: "EMAIL_RESERVED" }, "EMAIL_RESERVED"]
  ])("maps the documented marker %p to its field-specific rejection", async (body, reason) => {
    const pending = firstValueFrom(source.createStaff({ ...base }))
    http.expectOne(collection).flush({ errores: body }, { status: 400, statusText: "Bad Request" })
    const result = await pending
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatchObject({ code: "INVALID_DATA", reason })
      expect(result.error.message).not.toContain("x")
    }
  })

  it.each([
    [400, "INVALID_DATA"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [422, "UNKNOWN"]
  ])("maps HTTP %s to its typed failure without backend text", async (status, code) => {
    const pending = firstValueFrom(source.updateStaff(7, { ...base }))
    http
      .expectOne(record)
      .flush(
        { mensaje: "private backend detail about another collaborator" },
        { status: Number(status), statusText: "Failure" }
      )
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    if (!result.success) expect(result.error.message).not.toContain("private")
  })

  it("maps a transport failure to UNAVAILABLE", async () => {
    const pending = firstValueFrom(source.createStaff({ ...base }))
    http.expectOne(collection).error(new ProgressEvent("error"))
    expect(await pending).toMatchObject({ success: false, error: { code: "UNAVAILABLE" } })
  })

  it("dispatches nothing on the server platform", async () => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "https://api.example.test" },
        { provide: PLATFORM_ID, useValue: "server" }
      ]
    })
    const server = TestBed.inject(FieldStaffHttpSource)
    expect(await firstValueFrom(server.createStaff({ ...base }))).toMatchObject({
      success: false,
      error: { code: "UNCONFIGURED" }
    })
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })

  it("no longer exposes the retired existing-account link, and PUT /cuenta is never dispatched", async () => {
    expect("linkStaffAccount" in source).toBe(false)
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        provideFieldOperationsReads(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: origin }
      ]
    })
    const repository = TestBed.inject(FIELD_OPERATIONS_REPOSITORY)
    expect("linkStaffAccount" in repository).toBe(false)
    const writes = TestBed.inject(HttpTestingController)
    const pending = firstValueFrom(repository.createStaff({ ...base, createAccount: false }))
    // The only account write is the record write itself: no `/cuenta` endpoint is reachable.
    const request = writes.expectOne(collection)
    expect(request.request.url).not.toContain("/cuenta")
    request.flush(dto)
    expect((await pending).success).toBe(true)
    writes.expectNone(r => r.url.endsWith("/cuenta"))
  })
})
