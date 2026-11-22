import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { PRESERVE_API_CONFLICT } from "@/app/core/http/api-conflict-context"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { LinkStaffAccountParams } from "../../domain/params/field-operations.params"
import { FieldStaffHttpSource } from "./field-staff-http.source"

const origin = "http://localhost:8080"
const account = `${origin}/api/personal/7/cuenta`

const dto = {
  idPersonal: 7,
  nombre: "Staff",
  documento: "DOC-7",
  telefono: null,
  correo: null,
  idioma: "es",
  fechaIngreso: "2024-02-29",
  activo: true,
  idUsuario: 19 as number | null,
  disponibilidad: [{ dia: "LUNES", horaInicio: "08:00", horaFin: "12:00" }],
  fechaCreacion: "2026-01-01T12:00:00Z"
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

describe("staff account link transport", () => {
  let source: FieldStaffHttpSource, http: HttpTestingController
  beforeEach(() => {
    const app = setup()
    source = app.source
    http = app.http
  })
  afterEach(() => http.verify())

  it("sends exactly the captured account id and decodes the returned staff record", async () => {
    const pending = firstValueFrom(source.linkStaffAccount(7, { userId: 19 }))
    const request = http.expectOne(account)
    expect(request.request.method).toBe("PUT")
    expect(request.request.body).toEqual({ idUsuario: 19 })
    expect(request.request.transferCache).toBe(false)
    // The documented 404 of this write reaches the adapter, which owns its typed code.
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(true)
    request.flush(dto)
    expect(await pending).toMatchObject({
      success: true,
      data: { id: 7, userId: 19, availability: [{ weekday: "LUNES" }] }
    })
  })

  it("sends a null body to unlink the account", async () => {
    const pending = firstValueFrom(source.linkStaffAccount(7, { userId: null }))
    const request = http.expectOne(account)
    expect(request.request.method).toBe("PUT")
    expect(request.request.body).toEqual({ idUsuario: null })
    request.flush({ ...dto, idUsuario: null })
    expect(await pending).toMatchObject({ success: true, data: { id: 7, userId: null } })
  })

  it("snapshots the account id at call time, ignoring later mutation of the argument", async () => {
    const params: { userId: number | null } = { userId: 19 }
    const read = source.linkStaffAccount(7, params)
    params.userId = null
    const pending = firstValueFrom(read)
    http.expectOne(account).flush(dto)
    expect((await pending).success).toBe(true)
  })

  it.each([0, -1, 1.5, 2147483648, NaN, Infinity, "19", undefined, {}, true])(
    "rejects account id %p before dispatch",
    async userId => {
      const pending = source.linkStaffAccount(7, { userId } as unknown as LinkStaffAccountParams)
      expect(await firstValueFrom(pending)).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
      http.expectNone(() => true)
    }
  )

  it.each([0, -1, 1.5, 2147483648, NaN, "7", null, undefined])(
    "rejects staff target %p before dispatch",
    async id => {
      const pending = source.linkStaffAccount(id as unknown as number, { userId: 19 })
      expect(await firstValueFrom(pending)).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
      http.expectNone(() => true)
    }
  )

  it("rejects a response that does not describe the targeted staff record", async () => {
    const pending = firstValueFrom(source.linkStaffAccount(7, { userId: 19 }))
    http.expectOne(account).flush({ ...dto, idPersonal: 8 })
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })

  it.each([
    [400, "INVALID_DATA"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"]
  ])("maps HTTP %s to its typed failure without backend text", async (status, code) => {
    const pending = firstValueFrom(source.linkStaffAccount(7, { userId: 19 }))
    http
      .expectOne(account)
      .flush(
        { mensaje: "private backend detail about another collaborator" },
        { status: Number(status), statusText: "Failure" }
      )
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    if (!result.success) {
      expect(result.error.message).toBe("Staff request could not be completed")
      expect(result.error.message).not.toContain("private")
    }
  })

  it("maps a transport failure to UNAVAILABLE", async () => {
    const pending = firstValueFrom(source.linkStaffAccount(7, { userId: 19 }))
    http.expectOne(account).error(new ProgressEvent("error"))
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
    expect(await firstValueFrom(server.linkStaffAccount(7, { userId: null }))).toMatchObject({
      success: false,
      error: { code: "UNCONFIGURED" }
    })
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
