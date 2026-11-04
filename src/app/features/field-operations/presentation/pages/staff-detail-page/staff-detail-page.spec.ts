import { Location } from "@angular/common"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject } from "rxjs"
import { afterEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideFieldOperationsReads } from "../../../field-operations.providers"
import { staffReturnFilters, staffReturnState } from "../../navigation/staff-page-context"
import { FieldStaffStore } from "../../state/field-staff.store"
import { StaffDetailPage } from "./staff-detail-page"

@Component({ selector: "app-staff-directory-probe", template: "" })
class StaffDirectoryProbe {}

const api = "http://localhost:8080/api/personal"
const deadline = 4102444800000
const owner = { userId: 19, sessionDeadline: deadline }
const profile = {
  idPersonal: 7,
  nombre: "<b>Perfil literal</b>",
  documento: "DOC-7",
  telefono: null,
  correo: null,
  idioma: "es",
  fechaIngreso: "2024-02-29" as string | null,
  activo: false,
  idUsuario: 19 as number | null,
  disponibilidad: [
    { dia: "VIERNES", horaInicio: "08:15:30.123456789", horaFin: "17:45" },
    { dia: "LUNES", horaInicio: "09:00", horaFin: "12:00:00" }
  ],
  fechaCreacion: "2026-01-01T12:00:00-05:00"
}

async function setup(url = "/admin/staff/7", state?: Record<string, unknown>) {
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Session name is not staff name", "caller@example.test", null, deadline, 19)
  )
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: "admin/staff", component: StaffDirectoryProbe },
        {
          path: "admin/staff/me",
          component: StaffDetailPage,
          data: { ownStaffProfile: true }
        },
        { path: "admin/staff/:id", component: StaffDetailPage }
      ]),
      provideFieldOperationsReads(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } }
    ]
  })
  const http = TestBed.inject(HttpTestingController)
  // Use the real root store; no result-state or use-case replacements.
  const store = TestBed.inject(FieldStaffStore)
  const harness = await RouterTestingHarness.create()
  const router = TestBed.inject(Router)
  await router.navigateByUrl(url, { state })
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = () => harness.routeNativeElement!
  const respond = async (own = false, dto = profile) => {
    const request = http.expectOne(own ? `${api}/me` : `${api}/7`)
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    request.flush(dto)
    await settle()
  }
  const back = () => {
    const link = Array.from(element().querySelectorAll<HTMLAnchorElement>("a[href]")).find(
      item => new URL(item.href).pathname === "/admin/staff"
    )
    expect(link, "Explicit staff directory return link").toBeDefined()
    return link!
  }
  return { http, store, harness, router, settle, element, respond, back }
}

afterEach(() => TestBed.inject(HttpTestingController).verify())

describe("WP7 T4 S1/S3 staff profile read consumer", () => {
  it.each(["0", "-1", "1.5", "1e2", "2147483648"])(
    "does not dispatch reads for invalid route ID %s",
    async id => {
      const app = await setup(`/admin/staff/${id}`)
      app.http.expectNone(() => true)
      expect(app.element().textContent).not.toContain(profile.nombre)
    }
  )

  it("reads one matching profile and renders supplied literal/null/calendar/UTC fields without lookups", async () => {
    const app = await setup()
    await app.respond()
    const text = app.element().textContent ?? ""
    for (const value of [profile.nombre, "DOC-7", "es", "2024-02-29", "No registrado"])
      expect(text).toContain(value)
    expect(text).toMatch(/inactivo/i)
    expect(text).toContain("19")
    expect(text).toContain("2026")
    expect(text).toContain("17:00")
    expect(text).toContain("UTC")
    expect(app.element().querySelector("b")).toBeNull()
    expect(text).not.toContain("Session name is not staff name")
    expect(text).not.toContain("Administrador")
    expect(app.store.selectStaffById(7).result?.id).toBe(7)
    // Any N+1 catalog/account lookup or mutation is unexpected.
    app.http.expectNone(() => true)
    expect(app.element().querySelector("form")).toBeNull()
  })

  it("preserves weekly server order and full LocalTime precision without invented row identities", async () => {
    const app = await setup()
    await app.respond()
    const text = app.element().textContent ?? ""
    for (const time of ["08:15:30.123456789", "17:45", "09:00", "12:00:00"])
      expect(text).toContain(time)
    expect(text.toLocaleUpperCase().indexOf("VIERNES")).toBeGreaterThanOrEqual(0)
    expect(text.toLocaleUpperCase().indexOf("LUNES")).toBeGreaterThan(
      text.toLocaleUpperCase().indexOf("VIERNES")
    )
    app.http.expectNone(() => true)
  })

  it("uses explicit own-profile route data and /me, not the authentication user ID as staff ID", async () => {
    const app = await setup("/admin/staff/me")
    await app.respond(true)
    expect(app.store.selectMyStaffProfile().result).toMatchObject({ id: 7, userId: 19 })
    expect(app.element().textContent).toContain(profile.nombre)
    expect(app.element().textContent).not.toContain("Session name is not staff name")
    app.http.expectNone(() => true)
  })

  it("explains empty weekly restrictions without claiming free bookings and keeps nullable fields absent", async () => {
    const app = await setup()
    await app.respond(false, {
      ...profile,
      disponibilidad: [],
      fechaIngreso: null,
      idUsuario: null
    })
    const text = app.element().textContent ?? ""
    expect(text).toMatch(/sin restricci[oó]n semanal/i)
    expect(text).toContain("No registrado")
    expect(text).not.toContain("2024-02-29")
    expect(text).not.toMatch(/reservas libres|disponibilidad garantizada|sin disponibilidad/i)
    app.http.expectNone(() => true)
  })

  it("returns explicitly to effective page/size with owner-bound controls, never search in the URL", async () => {
    const state = staffReturnState({ search: "DOC private search", isActive: false }, owner)
    const app = await setup("/admin/staff/7?page=2&size=5", state)
    await app.respond()
    const link = app.back()
    const target = new URL(link.href)
    expect(target.searchParams.get("page")).toBe("2")
    expect(target.searchParams.get("size")).toBe("5")
    expect([...target.searchParams.keys()].sort()).toEqual(["page", "size"])
    expect(target.href).not.toContain("DOC")
    link.click()
    await app.settle()
    expect(app.router.url).toBe("/admin/staff?page=2&size=5")
    expect(staffReturnFilters(TestBed.inject(Location).getState(), owner)).toEqual({
      search: "DOC private search",
      isActive: false
    })
    app.http.expectNone(() => true)
  })

  it("defaults malformed paging and discards return controls belonging to another session owner", async () => {
    const state = staffReturnState(
      { search: "other owner's controls", isActive: false },
      {
        userId: 20,
        sessionDeadline: deadline
      }
    )
    const app = await setup("/admin/staff/7?page=1&page=2&size=5", state)
    await app.respond()
    const link = app.back()
    const target = new URL(link.href)
    expect(target.searchParams.get("page")).toBe("0")
    expect(target.searchParams.get("size")).toBe("20")
    link.click()
    await app.settle()
    expect(staffReturnFilters(TestBed.inject(Location).getState(), owner)).toEqual({})
    app.http.expectNone(() => true)
  })
})
