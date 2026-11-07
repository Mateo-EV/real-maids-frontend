import { provideHttpClient, withInterceptors } from "@angular/common/http"
import { AuthHttpSource } from "@/app/features/auth/infrastructure/source/auth-http.source"
import { AuthPersistentSession } from "@/app/features/auth/infrastructure/session/auth-persistent-session"
import { authInterceptor } from "@/app/features/auth/infrastructure/interceptors/auth.interceptor"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { CustomerType } from "../../domain/entities/customer.entity"
import { AcquisitionHttpSource } from "./acquisition-http.source"
import { CustomerHttpSource } from "./customer-http.source"

function setup(server = false) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      {
        provide: AuthPersistentSession,
        useValue: { browser: !server, origin: "https://api.example.test" }
      },
      {
        provide: AuthHttpSource,
        useValue: { accessToken: () => of("synthetic-access"), invalidate: () => undefined }
      },
      provideHttpClientTesting(),
      { provide: API_URL, useValue: "https://api.example.test" },
      { provide: PLATFORM_ID, useValue: server ? "server" : "browser" }
    ]
  })
  return {
    source: TestBed.inject(AcquisitionHttpSource),
    customers: TestBed.inject(CustomerHttpSource),
    http: TestBed.inject(HttpTestingController)
  }
}
describe("CRM reserved customer email contract", () => {
  it("posts only the email and optional excluded lead, never email in a URL; validates both flags", async () => {
    const s = setup()
    const pending = firstValueFrom(
      s.source.checkLeadEmail({ email: "ana@example.test", excludeLeadId: 7 })
    )
    const req = s.http.expectOne("https://api.example.test/api/prospectos/validacion-correo")
    expect(req.request.method).toBe("POST")
    expect(req.request.body).toEqual({ correo: "ana@example.test", idProspectoExcluir: 7 })
    expect(req.request.transferCache).toBe(false)
    req.flush({ clienteExistente: true, prospectoExistente: false })
    const result = await pending
    expect(result.success && result.data).toEqual({ customerExists: true, leadExists: false })
    s.http.verify()
  })
  it("rejects malformed flags and invalid input without manufacturing an available email", async () => {
    const s = setup()
    for (const email of ["", "bad", "a".repeat(121)]) {
      const result = await firstValueFrom(s.source.checkLeadEmail({ email }))
      expect(!result.success && result.error.code).toBe("INVALID_INPUT")
    }
    s.http.expectNone(() => true)
    const pending = firstValueFrom(s.source.checkLeadEmail({ email: "ana@example.test" }))
    s.http
      .expectOne("https://api.example.test/api/prospectos/validacion-correo")
      .flush({ clienteExistente: "false", prospectoExistente: false })
    const result = await pending
    expect(!result.success && result.error.code).toBe("INVALID_RESPONSE")
    s.http.verify()
  })
  it("does not dispatch the advisory read on SSR", async () => {
    const s = setup(true)
    const result = await firstValueFrom(s.source.checkLeadEmail({ email: "ana@example.test" }))
    expect(!result.success && result.error.code).toBe("UNCONFIGURED")
    s.http.expectNone(() => true)
  })
  it("recognizes only the fixed reserved-email marker on customer writes and conversion", async () => {
    const s = setup()
    const profile = {
      name: "Ana",
      type: CustomerType.RESIDENTIAL,
      email: "ana@example.test",
      phone: null
    }
    for (const [send, url] of [
      [() => s.customers.create(profile), "/api/clientes"],
      [() => s.customers.update({ id: 9, ...profile }), "/api/clientes/9"],
      [
        () => s.source.convertLead({ leadId: 7, type: CustomerType.RESIDENTIAL }),
        "/api/prospectos/7/conversion"
      ]
    ] as const) {
      const pending = firstValueFrom(send())
      s.http.expectOne("https://api.example.test" + url).flush(
        {
          codigo: 409,
          mensaje: "Private text must not reach UI",
          errores: { correo: "EMAIL_RESERVED" }
        },
        { status: 409, statusText: "Conflict" }
      )
      const result = await pending
      expect(!result.success && result.error.code).toBe("EMAIL_RESERVED")
    }
    const pending = firstValueFrom(s.customers.create(profile))
    s.http
      .expectOne("https://api.example.test/api/clientes")
      .flush({ mensaje: "EMAIL_RESERVED" }, { status: 409, statusText: "Conflict" })
    const result = await pending
    expect(!result.success && result.error.code).toBe("CONFLICT")
    s.http.verify()
  })
})
