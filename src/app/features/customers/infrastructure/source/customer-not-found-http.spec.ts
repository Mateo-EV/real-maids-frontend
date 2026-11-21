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
import { CustomerHttpSource } from "./customer-http.source"

const origin = "https://api.example.test"
const url = `${origin}/api/clientes`

/**
 * The seam this spec guards: the real auth interceptor, not only the adapter's own mapping. A
 * customer read that documents a `404` must reach the adapter, which is the only layer that knows
 * its typed not-found code; a list or a write keeps today's generic mapping.
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
    customers: TestBed.inject(CustomerHttpSource),
    http: TestBed.inject(HttpTestingController)
  }
}

describe("customer 404 delivery through the auth interceptor", () => {
  it("delivers the customer detail 404 to the adapter and keeps its typed not-found code", async () => {
    const s = setup()
    const pending = firstValueFrom(s.customers.findById(9))
    const request = s.http.expectOne(`${url}/9`)
    expect(request.request.method).toBe("GET")
    expect(request.request.headers.get("Authorization")).toBe("Bearer synthetic-access")
    // The call opts in explicitly, so the adapter — not the interceptor — classifies the status.
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(true)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "CUSTOMER_NOT_FOUND" } })
    expect(result).not.toHaveProperty("data")
    if (!result.success) expect(result.error.message).not.toContain("RAW INTERNAL")
    s.http.expectNone(`${url}/9`)
    s.http.expectNone(`${origin}/api/auth/refresh`)
  })

  it("delivers the own-profile 404 to the adapter as the stable unlinked-profile code", async () => {
    const s = setup()
    const pending = firstValueFrom(s.customers.findOwnProfile())
    const request = s.http.expectOne(`${url}/me`)
    expect(request.request.method).toBe("GET")
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(true)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "CUSTOMER_NOT_FOUND" } })
    s.http.expectNone(() => true)
  })

  it("keeps today's generic mapping for a list 404 that does not opt in", async () => {
    const s = setup()
    const pending = firstValueFrom(s.customers.findPage())
    const request = s.http.expectOne(candidate => candidate.url === url)
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(false)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "UNEXPECTED" } })
    s.http.expectNone(() => true)
  })

  it("keeps today's generic mapping for a write 404 that does not opt in", async () => {
    const s = setup()
    const pending = firstValueFrom(s.customers.setStatus({ customerId: 9, isActive: false }))
    const request = s.http.expectOne(`${url}/9/estado`)
    expect(request.request.method).toBe("PATCH")
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(false)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "UNEXPECTED" } })
    // No write replay either.
    s.http.expectNone(() => true)
  })
})
