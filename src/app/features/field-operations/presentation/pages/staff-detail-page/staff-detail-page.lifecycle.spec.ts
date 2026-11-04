import { Location } from "@angular/common"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideFieldOperationsReads } from "../../../field-operations.providers"
import { staffReturnState } from "../../navigation/staff-page-context"
import { StaffDetailPage } from "./staff-detail-page"

@Component({ template: "" })
class AwayPage {}

const api = "http://localhost:8080/api/personal"
const deadline = 4102444800000
const identity = (id = 19, expires = deadline) =>
  AuthSession.create("Caller", `caller${id}@example.test`, null, expires, id)
const dto = (id = 7) => ({
  idPersonal: id,
  nombre: `Personal ${id}`,
  documento: `DOC-${id}`,
  telefono: null,
  correo: null,
  idioma: "es",
  fechaIngreso: null,
  activo: true,
  idUsuario: 19,
  disponibilidad: [],
  fechaCreacion: "2026-01-01T12:00:00Z"
})

async function setup(url = "/admin/staff/7", server = false) {
  const session = new BehaviorSubject<AuthSession | null>(identity())
  const observe = vi.fn(() => session.asObservable())
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: "admin/staff", component: AwayPage },
        { path: "admin/staff/me", component: StaffDetailPage, data: { ownStaffProfile: true } },
        // Truthy is not the explicit own-profile contract.
        {
          path: "admin/staff/truthy/:id",
          component: StaffDetailPage,
          data: { ownStaffProfile: "true" }
        },
        { path: "admin/staff/:id", component: StaffDetailPage }
      ]),
      provideFieldOperationsReads(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: observe } },
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const http = TestBed.inject(HttpTestingController)
  const router = TestBed.inject(Router)
  const harness = await RouterTestingHarness.create()
  await router.navigateByUrl(url, {
    state: staffReturnState(
      { search: "Owner search", isActive: false },
      { userId: 19, sessionDeadline: deadline }
    )
  })
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = () => harness.routeNativeElement!
  const text = () => element().textContent ?? ""
  const click = async (label: string) => {
    const button = Array.from(element().querySelectorAll<HTMLButtonElement>("button")).find(
      item => item.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  return { http, router, harness, session, observe, settle, element, text, click }
}

afterEach(() => {
  TestBed.inject(HttpTestingController).verify()
  vi.restoreAllMocks()
})

describe("WP7 T4 S1/S3 profile read ownership and safe failures", () => {
  it("treats own 404 as a safe failure, never a fallback to /{auth.id} or the directory", async () => {
    const app = await setup("/admin/staff/me")
    app.http
      .expectOne(`${api}/me`)
      .flush({ mensaje: "private backend detail" }, { status: 404, statusText: "Not Found" })
    await app.settle()
    expect(app.text()).toContain("No se encontró el perfil")
    expect(app.text()).not.toContain("private backend detail")
    app.http.expectNone(() => true)
    await app.click("Reintentar")
    app.http.expectOne(`${api}/me`).flush(dto())
    await app.settle()
    expect(app.text()).toContain("Personal 7")
    app.http.expectNone(() => true)
  })

  it("does not infer /me from truthy route metadata", async () => {
    const app = await setup("/admin/staff/truthy/7")
    app.http.expectOne(`${api}/7`).flush(dto())
    await app.settle()
    expect(app.text()).toContain("Personal 7")
    app.http.expectNone(() => true)
  })

  it("cancels a pending previous route and never renders unrelated cached profile data", async () => {
    const app = await setup()
    const old = app.http.expectOne(`${api}/7`)
    await app.router.navigateByUrl("/admin/staff/8")
    await app.settle()
    expect(old.cancelled).toBe(true)
    expect(app.text()).not.toContain("Personal 7")
    app.http.expectOne(`${api}/8`).flush(dto(8))
    await app.settle()
    expect(app.text()).toContain("Personal 8")
    await app.router.navigateByUrl("/admin/staff/9")
    await app.settle()
    expect(app.text()).not.toContain("Personal 8")
    app.http.expectOne(`${api}/9`).flush({}, { status: 403, statusText: "Forbidden" })
    await app.settle()
    expect(app.text()).toContain("No tienes permiso")
    expect(app.text()).not.toContain("Personal 8")
    expect(app.text()).not.toContain("Sin restricción semanal registrada")
  })

  it("retains verified same-ID data during forced refresh/error and retries GET only", async () => {
    const app = await setup()
    app.http.expectOne(`${api}/7`).flush(dto())
    await app.settle()
    await app.click("Actualizar perfil")
    const refresh = app.http.expectOne(`${api}/7`)
    expect(app.text()).toContain("Personal 7")
    expect(app.text()).toContain("Actualizando perfil")
    refresh.flush({ mensaje: "private denial" }, { status: 403, statusText: "Forbidden" })
    await app.settle()
    expect(app.text()).toContain("Personal 7")
    expect(app.text()).toContain("desactualizados")
    expect(app.text()).toContain("No tienes permiso")
    expect(app.text()).not.toContain("private denial")
    await app.click("Reintentar")
    const retry = app.http.expectOne(`${api}/7`)
    expect(retry.request.method).toBe("GET")
    retry.flush({ ...dto(), nombre: "Perfil actualizado" })
    await app.settle()
    expect(app.text()).toContain("Perfil actualizado")
    expect(app.text()).not.toContain("desactualizados")
    app.http.expectNone(() => true)
  })

  it("checks freshness on revisits and preserves only the same-key expired result", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    const app = await setup()
    app.http.expectOne(`${api}/7`).flush(dto())
    await app.settle()
    await app.router.navigateByUrl("/admin/staff")
    await app.router.navigateByUrl("/admin/staff/7")
    await app.settle()
    expect(app.text()).toContain("Personal 7")
    app.http.expectNone(() => true)
    await app.router.navigateByUrl("/admin/staff")
    now.mockReturnValue(121001)
    await app.router.navigateByUrl("/admin/staff/7")
    await app.settle()
    expect(app.text()).toContain("Personal 7")
    expect(app.text()).toContain("Actualizando perfil")
    app.http.expectOne(`${api}/7`).flush(dto())
    await app.settle()
  })

  it("shows a retryable malformed DTO failure rather than fabricating an empty profile", async () => {
    const app = await setup()
    app.http.expectOne(`${api}/7`).flush({ ...dto(), idPersonal: 8 })
    await app.settle()
    expect(app.text()).toContain("respuesta del servicio no es válida")
    expect(app.text()).not.toContain("Personal 7")
    expect(app.text()).not.toContain("Sin restricción semanal registrada")
    await app.click("Reintentar")
    app.http.expectOne(`${api}/7`).flush(dto())
    await app.settle()
    expect(app.text()).toContain("Personal 7")
  })

  it("preserves work on same-session renewal but cancels and hides data on logout", async () => {
    const app = await setup()
    const pending = app.http.expectOne(`${api}/7`)
    app.session.next(identity())
    await app.settle()
    expect(pending.cancelled).toBe(false)
    pending.flush(dto())
    await app.settle()
    app.session.next(null)
    await app.settle()
    expect(app.text()).not.toContain("Personal 7")
    app.http.expectNone(() => true)
  })

  it.each([identity(20), identity(19, deadline + 1), null])(
    "cancels pending reads on identity/deadline replacement or logout (%s)",
    async replacement => {
      const app = await setup()
      const pending = app.http.expectOne(`${api}/7`)
      app.session.next(replacement)
      await app.settle()
      expect(pending.cancelled).toBe(true)
      expect(app.text()).not.toContain("Personal 7")
      const back = app.element().querySelector<HTMLAnchorElement>('a[href^="/admin/staff"]')!
      back.click()
      await app.settle()
      expect(
        (TestBed.inject(Location).getState() as Record<string, unknown>)["staffReturn"]
      ).toBeUndefined()
      app.http.expectNone(() => true)
    }
  )

  it("clears a verified profile and its return controls when the fixed session expires", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    const app = await setup()
    app.http.expectOne(`${api}/7`).flush(dto())
    await app.settle()
    expect(app.text()).toContain("Personal 7")
    now.mockReturnValue(deadline)
    app.session.next(identity())
    await app.settle()
    expect(app.text()).not.toContain("Personal 7")
    app.element().querySelector<HTMLAnchorElement>('a[href^="/admin/staff"]')!.click()
    await app.settle()
    expect(
      (TestBed.inject(Location).getState() as Record<string, unknown>)["staffReturn"]
    ).toBeUndefined()
    app.http.expectNone(() => true)
  })

  it("cancels the component-owned read on destruction without destroying the root store", async () => {
    const app = await setup()
    const pending = app.http.expectOne(`${api}/7`)
    await app.router.navigateByUrl("/admin/staff")
    await app.settle()
    expect(pending.cancelled).toBe(true)
    app.http.expectNone(() => true)
  })

  it("dispatches no staff or authentication observation during SSR", async () => {
    const app = await setup("/admin/staff/me", true)
    app.http.expectNone(() => true)
    expect(app.observe).not.toHaveBeenCalled()
    expect(app.text()).not.toContain("Personal 7")
  })
})
