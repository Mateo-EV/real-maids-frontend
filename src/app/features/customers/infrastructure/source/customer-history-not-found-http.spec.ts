import { provideHttpClient, withInterceptors } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it } from "vitest"
import { PRESERVE_API_CONFLICT } from "@/app/core/http/api-conflict-context"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { authInterceptor } from "@/app/features/auth/infrastructure/interceptors/auth.interceptor"
import { AuthPersistentSession } from "@/app/features/auth/infrastructure/session/auth-persistent-session"
import { AuthHttpSource } from "@/app/features/auth/infrastructure/source/auth-http.source"
import { CustomerHistoryHttpSource } from "./customer-history-http.source"

const origin = "https://api.example.test"
const url = `${origin}/api/clientes/7/historial`

/**
 * The seam this spec guards: the real auth interceptor, not only the adapter's own mapping. The
 * history read documents the customer's absence, so it opts in and the adapter keeps
 * `CUSTOMER_NOT_FOUND`; a `403` stays `FORBIDDEN` and a `5xx` stays generic.
 */
function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      { provide: AuthPersistentSession, useValue: { browser: true, origin } },
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
    history: TestBed.inject(CustomerHistoryHttpSource),
    http: TestBed.inject(HttpTestingController)
  }
}

describe("customer history 404 delivery through the auth interceptor", () => {
  it("delivers the documented customer absence to the adapter as CUSTOMER_NOT_FOUND", async () => {
    const s = setup()
    const pending = firstValueFrom(s.history.getHistory(7))
    const request = s.http.expectOne(
      candidate => candidate.url === url && candidate.params.get("tamanio") === "20"
    )
    expect(request.request.method).toBe("GET")
    expect(request.request.headers.get("Authorization")).toBe("Bearer synthetic-access")
    expect(request.request.transferCache).toBe(false)
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(true)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "CUSTOMER_NOT_FOUND" } })
    expect(result).not.toHaveProperty("data")
    if (!result.success) expect(result.error.message).not.toContain("RAW INTERNAL")
    s.http.expectNone(() => true)
  })

  it.each([
    [403, "FORBIDDEN"],
    [500, "UNEXPECTED"]
  ])("is never widened: an opted-in %s still maps to %s", async (status, code) => {
    const s = setup()
    const pending = firstValueFrom(s.history.getHistory(7))
    const request = s.http.expectOne(candidate => candidate.url === url)
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(true)
    request.flush({ mensaje: "RAW INTERNAL" }, { status, statusText: "Failure" })
    expect(await pending).toMatchObject({ success: false, error: { code } })
    s.http.expectNone(() => true)
  })
})
