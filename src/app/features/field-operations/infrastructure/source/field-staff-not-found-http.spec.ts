import { provideHttpClient, withInterceptors } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, firstValueFrom, of } from "rxjs"
import { describe, expect, it } from "vitest"
import { PRESERVE_API_CONFLICT } from "@/app/core/http/api-conflict-context"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { authInterceptor } from "@/app/features/auth/infrastructure/interceptors/auth.interceptor"
import { AuthPersistentSession } from "@/app/features/auth/infrastructure/session/auth-persistent-session"
import { AuthHttpSource } from "@/app/features/auth/infrastructure/source/auth-http.source"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideFieldOperationsReads } from "../../field-operations.providers"
import { StaffDetailPage } from "../../presentation/pages/staff-detail-page/staff-detail-page"
import { FieldStaffHttpSource } from "./field-staff-http.source"

const origin = "https://api.example.test"
const url = `${origin}/api/personal`
const deadline = 4102444800000
const profile = {
  idPersonal: 7,
  nombre: "<b>Perfil literal</b>",
  documento: "DOC-7",
  telefono: null,
  correo: null,
  idioma: "es",
  fechaIngreso: null,
  activo: true,
  idUsuario: 19,
  disponibilidad: [],
  fechaCreacion: "2026-01-01T12:00:00Z"
}

/**
 * The seam this spec guards: the real auth interceptor, not only the adapter's own mapping. A staff
 * read that documents a `404` must reach the adapter, which is the only layer that knows its typed
 * not-found code; the directory listing keeps today's generic mapping.
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
      { provide: PLATFORM_ID, useValue: "browser" },
      {
        provide: ObserveAuthSessionUseCase,
        useValue: {
          execute: () => of(AuthSession.create("Caller", "c@e.test", null, deadline, 19))
        }
      }
    ]
  })
  return {
    staff: TestBed.inject(FieldStaffHttpSource),
    http: TestBed.inject(HttpTestingController)
  }
}

describe("staff 404 delivery through the auth interceptor", () => {
  it.each([
    ["staff detail", (source: FieldStaffHttpSource) => source.getStaffById(7), `${url}/7`],
    ["own profile", (source: FieldStaffHttpSource) => source.getMyStaffProfile(), `${url}/me`]
  ])("delivers the %s 404 to the adapter as its typed code", async (_label, call, target) => {
    const s = setup()
    const pending = firstValueFrom(call(s.staff))
    const request = s.http.expectOne(target)
    expect(request.request.method).toBe("GET")
    expect(request.request.headers.get("Authorization")).toBe("Bearer synthetic-access")
    // The call opts in explicitly, so the adapter — not the interceptor — classifies the status.
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(true)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "NOT_FOUND" } })
    expect(result).not.toHaveProperty("data")
    if (!result.success) expect(result.error.message).not.toContain("RAW INTERNAL")
    s.http.expectNone(() => true)
  })

  it("keeps today's generic mapping for a directory 404 that does not opt in", async () => {
    const s = setup()
    const pending = firstValueFrom(s.staff.getStaff())
    const request = s.http.expectOne(candidate => candidate.url === url)
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(false)
    request.flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    expect(await pending).toMatchObject({ success: false, error: { code: "UNKNOWN" } })
    s.http.expectNone(() => true)
  })

  it.each([
    [403, "FORBIDDEN"],
    [500, "UNKNOWN"],
    [0, "UNAVAILABLE"]
  ])("is never widened: an opted-in %s still maps to %s", async (status, code) => {
    const s = setup()
    const pending = firstValueFrom(s.staff.getStaffById(7))
    const request = s.http.expectOne(`${url}/7`)
    expect(request.request.context.get(PRESERVE_API_CONFLICT)).toBe(true)
    request.flush({ mensaje: "RAW INTERNAL" }, { status, statusText: "Failure" })
    expect(await pending).toMatchObject({ success: false, error: { code } })
    s.http.expectNone(() => true)
  })
})

@Component({ selector: "app-staff-directory-probe", template: "" })
class StaffDirectoryProbe {}

/** The rendered contract, also through the real interceptor: absence is definitive, failure retries. */
async function setupPage() {
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Caller", "caller@example.test", null, deadline, 19)
  )
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: "admin/staff", component: StaffDirectoryProbe },
        { path: "admin/staff/me", component: StaffDetailPage, data: { ownStaffProfile: true } },
        { path: "admin/staff/:id", component: StaffDetailPage }
      ]),
      provideFieldOperationsReads(),
      provideHttpClient(withInterceptors([authInterceptor])),
      { provide: AuthPersistentSession, useValue: { browser: true, origin } },
      {
        provide: AuthHttpSource,
        useValue: { accessToken: () => of("synthetic-access"), invalidate: () => undefined }
      },
      provideHttpClientTesting(),
      { provide: API_URL, useValue: origin },
      { provide: PLATFORM_ID, useValue: "browser" },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } }
    ]
  })
  const http = TestBed.inject(HttpTestingController)
  const harness = await RouterTestingHarness.create()
  await TestBed.inject(Router).navigateByUrl("/admin/staff/7")
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = () => harness.routeNativeElement!
  const buttons = () =>
    Array.from(element().querySelectorAll("button")).map(b => b.textContent?.trim() ?? "")
  return { http, harness, settle, element, buttons }
}

describe("staff profile absence vs failure rendering", () => {
  it("renders a definitive no-disponible state without a retry for the documented 404", async () => {
    const app = await setupPage()
    app.http
      .expectOne(`${url}/7`)
      .flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    await app.settle()
    const text = app.element().textContent ?? ""
    expect(text).toContain("No se encontró el perfil de personal")
    expect(text).toContain("no está disponible")
    expect(text).not.toContain("RAW INTERNAL")
    expect(app.element().querySelector("[data-staff-unavailable]")).not.toBeNull()
    // Nothing to retry: the same GET cannot turn an authoritative absence into a record.
    expect(app.buttons()).not.toContain("Reintentar")
    expect(app.buttons()).not.toContain("Actualizar perfil")
    app.http.expectNone(() => true)
  })

  it("keeps the retryable alert and its retry for a transient failure", async () => {
    const app = await setupPage()
    app.http
      .expectOne(`${url}/7`)
      .flush({ mensaje: "RAW INTERNAL" }, { status: 500, statusText: "Server Error" })
    await app.settle()
    expect(app.element().textContent).toContain("No se pudo cargar el perfil")
    expect(app.element().querySelector("[data-staff-unavailable]")).toBeNull()
    expect(app.buttons()).toContain("Reintentar")
    Array.from(app.element().querySelectorAll<HTMLButtonElement>("button"))
      .find(b => b.textContent?.trim() === "Reintentar")!
      .click()
    await app.settle()
    app.http.expectOne(`${url}/7`).flush(profile)
    await app.settle()
    expect(app.element().textContent).toContain(profile.nombre)
    app.http.expectNone(() => true)
  })
})
