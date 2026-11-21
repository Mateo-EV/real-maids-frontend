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
import { CustomerSupportHttpSource } from "./customer-support-http.source"
import { supportRequestsUrl } from "./customer-support-http.testing"

const origin = "https://api.example.test"

/**
 * Support documented a `404` on the attention detail, but the auth interceptor replaced it with a
 * generic failure before the adapter could classify it, so the portal's «no disponible» state was
 * unreachable. The inbox keeps today's mapping.
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
    source: TestBed.inject(CustomerSupportHttpSource),
    http: TestBed.inject(HttpTestingController)
  }
}

describe("customer support 404 delivery through the auth interceptor", () => {
  it("delivers the attention detail 404 as the typed NOT_FOUND", async () => {
    const s = setup()
    const pending = firstValueFrom(s.source.getRequest(17))
    const request = s.http.expectOne(`${supportRequestsUrl}/17`)
    expect(request.request.method).toBe("GET")
    expect(request.request.headers.get("Authorization")).toBe("Bearer synthetic-access")
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(true)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "NOT_FOUND" } })
    if (!result.success) expect(result.error.message).not.toContain("RAW INTERNAL")
    s.http.expectNone(`${supportRequestsUrl}/17`)
    s.http.expectNone(`${origin}/api/auth/refresh`)
  })

  it("keeps today's generic mapping for an inbox 404 that does not opt in", async () => {
    const s = setup()
    const pending = firstValueFrom(s.source.getRequests({}))
    const request = s.http.expectOne(candidate => candidate.url === supportRequestsUrl)
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(false)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "UNAVAILABLE" } })
    s.http.expectNone(() => true)
  })
})
