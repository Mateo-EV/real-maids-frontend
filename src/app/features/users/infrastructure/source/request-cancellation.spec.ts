import { TestBed } from "@angular/core/testing"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { provideHttpClient } from "@angular/common/http"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appConfig } from "@/app/core/config/app.config"
import { AUTH_REPOSITORY } from "@/app/features/auth/domain/repositories/auth.repository"
import { AuthRepositoryImpl } from "@/app/features/auth/infrastructure/repositories/auth.repository-impl"
import { AUDIT_LOG_REPOSITORY } from "../../domain/repositories/audit-log.repository"
import { AuditLogRepositoryImpl } from "../repositories/audit-log.repository-impl"

describe("Real HTTP request cancellation", () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    TestBed.inject(HttpTestingController, null)?.verify()
    vi.restoreAllMocks()
  })

  it("unsubscribes the dispatched audit read without delivery or a rollback claim", () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" },
        { provide: AUDIT_LOG_REPOSITORY, useExisting: AuditLogRepositoryImpl }
      ]
    })
    const next = vi.fn(),
      error = vi.fn(),
      complete = vi.fn()
    const subscription = TestBed.inject(AUDIT_LOG_REPOSITORY)
      .getAuditLogs({ page: 0, size: 5 })
      .subscribe({ next, error, complete })
    const request = TestBed.inject(HttpTestingController).expectOne(
      r => r.url === "http://localhost:8080/api/auditoria"
    )
    expect(request.request.method).toBe("GET")
    expect(request.cancelled).toBe(false)
    subscription.unsubscribe()
    expect(request.cancelled).toBe(true)
    expect(next).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
  })

  it.each(["FakePassword1", "wrong"])(
    "cancels the dispatched login for password input %s without persisting credentials",
    async password => {
      TestBed.configureTestingModule({
        providers: [...appConfig.providers, provideHttpClientTesting()]
      })
      const auth = TestBed.inject(AUTH_REPOSITORY)
      const next = vi.fn()
      const read = vi.spyOn(Storage.prototype, "getItem")
      const write = vi.spyOn(Storage.prototype, "setItem")
      try {
        const subscription = auth.login({ email: "fake@example.test", password }).subscribe(next)
        const request = TestBed.inject(HttpTestingController).expectOne(
          "http://localhost:8080/api/auth/login"
        )
        expect(request.request.body).toEqual({ correo: "fake@example.test", password })
        expect(next).not.toHaveBeenCalled()
        subscription.unsubscribe()
        expect(request.cancelled).toBe(true)
        expect(next).not.toHaveBeenCalled()
        expect(await firstValueFrom(auth.me())).toMatchObject({ success: false })
        expect(read.mock.calls.some(([key]) => key === "authenticated")).toBe(false)
        expect(
          write.mock.calls.every(([, value]) => JSON.parse(String(value)).credentials === null)
        ).toBe(true)
      } finally {
        read.mockRestore()
        write.mockRestore()
      }
    }
  )

  it("keeps auth and audit tokens bound to their HTTP repository implementations", () => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()]
    })
    expect(TestBed.inject(AUTH_REPOSITORY)).toBeInstanceOf(AuthRepositoryImpl)
    expect(TestBed.inject(AUDIT_LOG_REPOSITORY)).toBeInstanceOf(AuditLogRepositoryImpl)
  })
})
