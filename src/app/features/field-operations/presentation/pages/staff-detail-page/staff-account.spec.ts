import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HotToastService } from "@ngxpert/hot-toast"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideFieldOperationsReads } from "../../../field-operations.providers"
import { FieldOperationsError } from "../../../domain/errors/field-operations.error"
import { FieldStaffHttpSource } from "../../../infrastructure/source/field-staff-http.source"
import { staffDto } from "../../../infrastructure/source/field-staff-http.validation"
import { FieldStaffStore } from "../../state/field-staff.store"
import { StaffDetailPage } from "./staff-detail-page"

const api = "http://localhost:8080/api/personal"
const deadline = 4102444800000
const profile = (userId: number | null, accountEmail?: string | null) => ({
  idPersonal: 7,
  nombre: "Colaboradora Verificada",
  documento: "DOC-7",
  telefono: "999 888 777",
  correo: "ficha@example.test",
  idioma: "es",
  fechaIngreso: "2024-02-29",
  activo: true,
  idUsuario: userId,
  ...(accountEmail === undefined ? {} : { correoUsuario: accountEmail }),
  disponibilidad: [],
  fechaCreacion: "2026-01-01T12:00:00Z"
})

async function setup(userId: number | null = null, accountEmail?: string | null) {
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Caller", "caller@example.test", null, deadline, 19)
  )
  const success = vi.fn((message: string) => message)
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: "admin/staff/:id", component: StaffDetailPage }]),
      provideFieldOperationsReads(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
      { provide: HotToastService, useValue: { success } }
    ]
  })
  const http = TestBed.inject(HttpTestingController)
  const store = TestBed.inject(FieldStaffStore)
  const router = TestBed.inject(Router)
  const harness = await RouterTestingHarness.create()
  await router.navigateByUrl("/admin/staff/7")
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = () => harness.routeNativeElement!
  const dialog = () => document.querySelector<HTMLElement>("app-staff-editor")
  const control = <T extends HTMLElement>(selector: string) => dialog()!.querySelector<T>(selector)!
  const click = async (label: string, within: ParentNode = element()) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label || b.getAttribute("aria-label") === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  const fill = async (selector: string, value: string) => {
    const input = control<HTMLInputElement>(selector)
    input.value = value
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("blur"))
    await settle()
  }
  const submit = async () => {
    dialog()!
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  const respond = async (dto = profile(userId, accountEmail)) => {
    const request = http.expectOne(`${api}/7`)
    expect(request.request.method).toBe("GET")
    request.flush(dto)
    await settle()
  }
  const openEdit = async () => {
    await click("Editar")
    expect(dialog()).not.toBeNull()
  }
  const account = () => element().querySelector("[data-staff-account]")!
  return {
    http,
    store,
    router,
    harness,
    settle,
    element,
    dialog,
    control,
    click,
    fill,
    submit,
    respond,
    openEdit,
    account,
    success
  }
}

describe("WP11 staff access account derived from the record", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.querySelectorAll(".cdk-overlay-container").forEach(element => element.remove())
    TestBed.inject(HttpTestingController).verify()
  })

  it("reads a record without accountEmail as sin cuenta de acceso even when the identifier remains", async () => {
    const app = await setup(31)
    await app.respond()
    expect(app.account().getAttribute("data-staff-account")).toBe("none")
    expect(app.account().textContent).toContain("Sin cuenta de acceso")
    // A retained identifier is not an account: nothing invents an email or a linking action.
    expect(app.account().textContent).not.toContain("31")
    expect(app.element().textContent).not.toMatch(/Vincular cuenta|Desvincular cuenta/)
    app.http.expectNone(() => true)
  })

  it("prints the active account email and never the bare identifier", async () => {
    const app = await setup(31, "activa@example.test")
    await app.respond()
    expect(app.account().getAttribute("data-staff-account")).toBe("active")
    expect(app.account().textContent).toContain("Cuenta de acceso activa")
    expect(app.account().textContent).toContain("activa@example.test")
    expect(app.account().textContent).not.toContain("31")
    app.http.expectNone(() => true)
  })

  it("retires the existing-account linking screen and its transport", async () => {
    const app = await setup(null)
    await app.respond()
    await app.openEdit()
    // No selector, no page of users, no `/cuenta` write, no linking dialog in the document.
    expect(document.querySelector("app-staff-account-link-dialog")).toBeNull()
    expect(document.querySelector("app-staff-account-unlink-dialog")).toBeNull()
    expect(app.dialog()!.textContent).not.toMatch(/Vincular cuenta|Desvincular cuenta/)
    expect(app.dialog()!.textContent).toContain("Cuenta de acceso")
    app.http.expectNone(r => r.url.endsWith("/usuarios") || r.url.endsWith("/cuenta"))
    expect("linkStaffAccount" in TestBed.inject(FieldStaffHttpSource)).toBe(false)
  })
})

describe("WP11 employee edit from the record", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.querySelectorAll(".cdk-overlay-container").forEach(element => element.remove())
    TestBed.inject(HttpTestingController).verify()
  })

  it("leaves an unchanged active account alone and sends no account key", async () => {
    const app = await setup(31, "activa@example.test")
    await app.respond()
    await app.openEdit()
    expect(app.control("#staff-account-state").textContent).toContain("activa")
    expect(app.control<HTMLInputElement>("#staff-create-account").checked).toBe(true)
    expect(app.control<HTMLInputElement>("#staff-name").value).toBe("Colaboradora Verificada")
    await app.submit()
    const write = app.http.expectOne(`${api}/7`)
    expect(write.request.method).toBe("PUT")
    expect(write.request.body).toEqual({
      nombre: "Colaboradora Verificada",
      documento: "DOC-7",
      telefono: "999 888 777",
      correo: "ficha@example.test",
      idioma: "es",
      fechaIngreso: "2024-02-29"
    })
    write.flush(profile(31, "activa@example.test"))
    await app.settle()
    // One message, exactly one fresh read of this record, and no second write.
    expect(app.success).toHaveBeenCalledExactlyOnceWith("Empleado actualizado correctamente.")
    const reread = app.http.expectOne(`${api}/7`)
    expect(reread.request.method).toBe("GET")
    reread.flush(profile(31, "activa@example.test"))
    await app.settle()
    expect(app.dialog()).toBeNull()
    app.http.expectNone(() => true)
  })

  it("reactivates the retained account instead of creating a second one", async () => {
    const app = await setup(31)
    await app.respond()
    await app.openEdit()
    expect(app.control("#staff-account-state").textContent).toContain("sin cuenta de acceso")
    expect(app.control<HTMLInputElement>("#staff-create-account").checked).toBe(false)
    expect(app.dialog()!.textContent).toContain("Recrear la cuenta de acceso")
    app.control<HTMLInputElement>("#staff-create-account").click()
    await app.settle()
    await app.fill("#staff-account-password", "Clave1234")
    await app.submit()
    const write = app.http.expectOne(`${api}/7`)
    expect(write.request.body).toMatchObject({ crearCuenta: true, password: "Clave1234" })
    write.flush(profile(31, "ficha@example.test"))
    await app.settle()
    app.http.expectOne(`${api}/7`).flush(profile(31, "ficha@example.test"))
    await app.settle()
    expect(app.success).toHaveBeenCalledExactlyOnceWith("Empleado actualizado correctamente.")
  })

  it("requires explicit confirmation before retiring the access, then sends false without a password", async () => {
    const app = await setup(31, "activa@example.test")
    await app.respond()
    await app.openEdit()
    app.control<HTMLInputElement>("#staff-create-account").click()
    await app.settle()
    expect(app.dialog()!.textContent).toContain("Baja del acceso")
    expect(app.dialog()!.textContent).toContain("dejará de poder iniciar sesión")
    await app.submit()
    app.http.expectNone(r => r.method === "PUT")
    await app.click("Confirmar baja del acceso", app.dialog()!)
    expect(app.dialog()!.textContent).toContain("Baja confirmada")
    await app.submit()
    const write = app.http.expectOne(`${api}/7`)
    expect(write.request.body).toMatchObject({ crearCuenta: false })
    expect(Object.keys(write.request.body)).not.toContain("password")
    write.flush(profile(31))
    await app.settle()
    app.http.expectOne(`${api}/7`).flush(profile(31))
    await app.settle()
    expect(app.success).toHaveBeenCalledExactlyOnceWith("Empleado actualizado correctamente.")
    expect(app.account().textContent).toContain("Sin cuenta de acceso")
  })

  it("withdraws the retirement by keeping the account and sends no account key", async () => {
    const app = await setup(31, "activa@example.test")
    await app.respond()
    await app.openEdit()
    app.control<HTMLInputElement>("#staff-create-account").click()
    await app.settle()
    await app.click("Confirmar baja del acceso", app.dialog()!)
    await app.click("Mantener la cuenta", app.dialog()!)
    expect(app.control<HTMLInputElement>("#staff-create-account").checked).toBe(true)
    expect(app.dialog()!.textContent).not.toContain("Confirmar baja del acceso")
    await app.submit()
    const write = app.http.expectOne(`${api}/7`)
    expect(Object.keys(write.request.body)).not.toContain("crearCuenta")
    write.flush(profile(31, "activa@example.test"))
    await app.settle()
    app.http.expectOne(`${api}/7`).flush(profile(31, "activa@example.test"))
    await app.settle()
  })

  it("keeps the draft, blocks duplicate submits and refuses dismissal when the write fails", async () => {
    const app = await setup(31, "activa@example.test")
    await app.respond()
    await app.openEdit()
    await app.fill("#staff-name", "  Nombre Corregido  ")
    await app.submit()
    const write = app.http.expectOne(`${api}/7`)
    await app.submit()
    app.http.expectNone(r => r.method === "PUT")
    const cdk = getDebugNode(app.dialog()!)!.injector.get(CdkDialogRef)
    cdk.overlayRef.backdropElement!.click()
    app
      .dialog()!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }))
    await app.settle()
    expect(app.dialog()).not.toBeNull()
    write.flush({ mensaje: "privado" }, { status: 403, statusText: "Forbidden" })
    await app.settle()
    expect(app.dialog()!.textContent).toContain("No tienes permiso")
    expect(app.dialog()!.textContent).not.toContain("privado")
    expect(app.control<HTMLInputElement>("#staff-name").value).toContain("Nombre Corregido")
    expect(app.success).not.toHaveBeenCalled()
    app.http.expectNone(r => r.method === "GET")
  })

  it("closes the captured editor when the route owner is replaced, without applying it to the new record", async () => {
    const app = await setup(31, "activa@example.test")
    await app.respond()
    await app.openEdit()
    await app.router.navigateByUrl("/admin/staff/8")
    await app.settle()
    expect(app.dialog()).toBeNull()
    app.http.expectOne(`${api}/8`).flush({ ...profile(null), idPersonal: 8 })
    await app.settle()
    expect(app.element().querySelector("[data-staff-account]")!.textContent).toContain(
      "Sin cuenta de acceso"
    )
  })
})

describe("S9 linked account email in the staff DTO", () => {
  it("carries the account email and keeps null when the contract omits it", () => {
    expect(staffDto(profile(31, "vinculada@example.test")).accountEmail).toBe(
      "vinculada@example.test"
    )
    expect(staffDto(profile(31)).accountEmail).toBeNull()
    expect(staffDto({ ...profile(31), correoUsuario: null }).accountEmail).toBeNull()
  })

  it("rejects a non-string account email as an invalid response", () => {
    for (const value of [31, true, {}, [], "x".repeat(121)]) {
      let caught: unknown
      try {
        staffDto({ ...profile(31), correoUsuario: value })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(FieldOperationsError)
      expect((caught as FieldOperationsError).code).toBe("INVALID_RESPONSE")
    }
  })
})
