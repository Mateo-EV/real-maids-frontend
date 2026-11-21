import { provideHttpClient, withInterceptors } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { PRESERVE_API_CONFLICT } from "@/app/core/http/api-conflict-context"
import { AuthHttpSource } from "@/app/features/auth/infrastructure/source/auth-http.source"
import { AuthPersistentSession } from "@/app/features/auth/infrastructure/session/auth-persistent-session"
import { authInterceptor } from "@/app/features/auth/infrastructure/interceptors/auth.interceptor"
import { PropertyHttpSource } from "./property-http.source"
import { AcquisitionHttpSource } from "./acquisition-http.source"

const origin = "https://api.example.test"
const leadsUrl = `${origin}/api/prospectos`
const propertiesUrl = `${origin}/api/clientes/9/propiedades`

/**
 * The seam this spec guards: the real auth interceptor, not only the adapter's own mapping. The
 * prospecto detail read documents an authoritative `404`, so it opts in and the adapter classifies
 * it as `LEAD_NOT_FOUND`; the prospecto list, the prospecto writes and every property call stay
 * un-opted-in, so an absence there keeps the generic mapping.
 *
 * `PROPERTY_NOT_FOUND` is deliberately left without an opted-in producer: the customer-scoped
 * property surface has no own-property detail read, only a list and three writes.
 */
function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      {
        provide: AuthPersistentSession,
        useValue: { browser: true, origin }
      },
      {
        provide: AuthHttpSource,
        useValue: { accessToken: () => of("synthetic-access"), invalidate: () => undefined }
      },
      provideHttpClientTesting(),
      { provide: API_URL, useValue: origin },
      { provide: PLATFORM_ID, useValue: "browser" }
    ]
  })
  return {
    leads: TestBed.inject(AcquisitionHttpSource),
    properties: TestBed.inject(PropertyHttpSource),
    http: TestBed.inject(HttpTestingController)
  }
}

describe("acquisition 404 delivery through the auth interceptor", () => {
  it("delivers the prospecto detail 404 to the adapter as the typed LEAD_NOT_FOUND", async () => {
    const s = setup()
    const pending = firstValueFrom(s.leads.findLead(7))
    const request = s.http.expectOne(`${leadsUrl}/7`)
    expect(request.request.method).toBe("GET")
    expect(request.request.headers.get("Authorization")).toBe("Bearer synthetic-access")
    // The detail read opts in explicitly, so the adapter — not the interceptor — classifies it.
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(true)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "LEAD_NOT_FOUND" } })
    expect(result).not.toHaveProperty("data")
    if (!result.success) expect(result.error.message).not.toContain("RAW INTERNAL")
    s.http.expectNone(`${leadsUrl}/7`)
    s.http.expectNone(`${origin}/api/auth/refresh`)
  })

  it("delivers the prospecto list 404 as today's generic failure because it does not opt in", async () => {
    const s = setup()
    const pending = firstValueFrom(s.leads.listLeads({ offset: 0, limit: 20 }))
    const request = s.http.expectOne(candidate => candidate.url === leadsUrl)
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(false)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "UNEXPECTED" } })
    s.http.expectNone(() => true)
  })

  it("delivers the prospecto delete 404 as today's generic failure because a write never opts in", async () => {
    const s = setup()
    const pending = firstValueFrom(s.leads.deleteLead(7))
    const request = s.http.expectOne(`${leadsUrl}/7`)
    expect(request.request.method).toBe("DELETE")
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(false)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "UNEXPECTED" } })
    // No write replay either.
    s.http.expectNone(() => true)
  })

  it("keeps the property list 404 generic: PROPERTY_NOT_FOUND has no detail read to opt in", async () => {
    const s = setup()
    const pending = firstValueFrom(s.properties.findByCustomer(9))
    const request = s.http.expectOne(propertiesUrl)
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(false)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "UNEXPECTED" } })
    s.http.expectNone(() => true)
  })

  it("keeps the property status write 404 generic", async () => {
    const s = setup()
    const pending = firstValueFrom(s.properties.setStatus(9, 4, false))
    const request = s.http.expectOne(`${propertiesUrl}/4/estado`)
    expect(request.request.method).toBe("PATCH")
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(false)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "UNEXPECTED" } })
    s.http.expectNone(() => true)
  })
})
