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
import { StaffPage } from "../../pages/staff-page/staff-page"

const api = "http://localhost:8080/api/personal"
const deadline = 4102444800000

const dto = (id = 7, name = "Colaboradora Verificada") => ({
  idPersonal: id,
  nombre: name,
  documento: `DOC-${id}`,
  telefono: null,
  correo: null,
  idioma: "es",
  fechaIngreso: null,
  activo: true,
  idUsuario: null,
  disponibilidad: [],
  fechaCreacion: "2026-01-01T12:00:00Z"
})
const page = (contenido: unknown[] = [], pagina = 0, tamanio = 20, totalElementos = 0) => ({
  contenido,
  pagina,
  tamanio,
  totalElementos,
  totalPaginas: Math.ceil(totalElementos / tamanio)
})

async function setup() {
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Caller", "caller@example.test", null, deadline, 19)
  )
  const success = vi.fn((message: string) => message)
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: "admin/staff", component: StaffPage }]),
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
  const harness = await RouterTestingHarness.create()
  await TestBed.inject(Router).navigateByUrl("/admin/staff")
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  http.expectOne(`${api}?pagina=0&tamanio=20`).flush(page())
  await settle()
  const element = () => harness.routeNativeElement!
  const dialog = () => document.querySelector<HTMLElement>("app-staff-editor")
  const control = <T extends HTMLElement>(selector: string) => dialog()!.querySelector<T>(selector)!
  const click = async (label: string, within: ParentNode = document) => {
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
  const toggleAccount = async () => {
    control<HTMLInputElement>("#staff-create-account").click()
    await settle()
  }
  const submit = async () => {
    dialog()!
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  const openCreate = async () => {
    await click("Crear empleado", element())
    expect(dialog()).not.toBeNull()
  }
  const identity = async () => {
    await fill("#staff-name", "  Colaboradora Nueva  ")
    await fill("#staff-document", " DOC-9 ")
  }
  return {
    http,
    settle,
    element,
    dialog,
    control,
    click,
    fill,
    toggleAccount,
    submit,
    openCreate,
    identity,
    success
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.querySelectorAll(".cdk-overlay-container").forEach(element => element.remove())
})

// WP11 T9 / S1, S5: the employee editor is the customer editor's mirror at the list owner boundary.
describe("WP11 employee registration from the directory", () => {
  it("registers without an account and sends no account key at all", async () => {
    const app = await setup()
    await app.openCreate()
    expect(app.dialog()!.textContent).toContain("Crear empleado")
    expect(app.control<HTMLInputElement>("#staff-create-account").checked).toBe(false)
    expect(app.dialog()!.querySelector("#staff-account-password")).toBeNull()
    await app.identity()
    await app.submit()
    const write = app.http.expectOne(api)
    expect(write.request.method).toBe("POST")
    expect(write.request.body).toEqual({
      nombre: "Colaboradora Nueva",
      documento: "DOC-9",
      telefono: null,
      correo: null,
      idioma: "es",
      fechaIngreso: null
    })
    expect(Object.keys(write.request.body)).not.toContain("crearCuenta")
    expect(Object.keys(write.request.body)).not.toContain("password")
    write.flush(dto(9, "Colaboradora Nueva"))
    await app.settle()
    // Confirmed success: one message and exactly one fresh read of the page in view.
    expect(app.success).toHaveBeenCalledExactlyOnceWith("Empleado creado correctamente.")
    const reread = app.http.expectOne(`${api}?pagina=0&tamanio=20`)
    expect(reread.request.method).toBe("GET")
    reread.flush(page([dto(9, "Colaboradora Nueva")], 0, 20, 1))
    await app.settle()
    expect(app.dialog()).toBeNull()
    expect(app.element().textContent).toContain("Colaboradora Nueva")
    app.http.expectNone(() => true)
  })

  it("creates the access account with the initial password only when the box is checked", async () => {
    const app = await setup()
    await app.openCreate()
    await app.identity()
    await app.fill("#staff-email", "nueva@example.test")
    await app.toggleAccount()
    expect(app.dialog()!.textContent).toContain("Crear cuenta de acceso")
    await app.fill("#staff-account-password", "Clave1234")
    await app.submit()
    const write = app.http.expectOne(api)
    expect(write.request.body).toMatchObject({
      nombre: "Colaboradora Nueva",
      documento: "DOC-9",
      correo: "nueva@example.test",
      crearCuenta: true,
      password: "Clave1234"
    })
  })

  it("keeps the password input hidden and never required when the account is untouched", async () => {
    const app = await setup()
    await app.openCreate()
    await app.identity()
    await app.submit()
    expect(app.dialog()!.querySelector("#staff-account-password")).toBeNull()
    expect(app.http.expectOne(api).request.body).not.toHaveProperty("password")
  })

  it("requires the staff email and the initial password as soon as the account is requested", async () => {
    const app = await setup()
    await app.openCreate()
    await app.identity()
    await app.toggleAccount()
    expect(app.dialog()!.querySelector("#staff-account-password")).not.toBeNull()
    await app.submit()
    app.http.expectNone(() => true)
    expect(app.dialog()!.textContent).toContain(
      "La cuenta de acceso necesita el correo de la ficha."
    )
    expect(app.dialog()!.textContent).toContain(
      "La cuenta de acceso necesita una contraseña inicial."
    )
  })

  it("blocks a duplicate submit and every dismissal while pending", async () => {
    const app = await setup()
    await app.openCreate()
    await app.identity()
    await app.submit()
    const write = app.http.expectOne(api)
    await app.submit()
    expect(app.dialog()!.querySelector("form")).not.toBeNull()
    // Duplicate submit, Escape, backdrop and Cancel are all refused while the write is pending.
    app.http.expectNone(r => r.method === "POST")
    app
      .dialog()!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }))
    await app.settle()
    const cdk = getDebugNode(app.dialog()!)!.injector.get(CdkDialogRef)
    cdk.overlayRef.backdropElement!.click()
    await app.settle()
    await app.click("Cancelar", app.dialog()!)
    expect(app.dialog()).not.toBeNull()
    write.flush(dto(9, "Colaboradora Nueva"))
    await app.settle()
    app.http.expectOne(`${api}?pagina=0&tamanio=20`).flush(page([dto(9, "Colaboradora Nueva")]))
    await app.settle()
    expect(app.dialog()).toBeNull()
    expect(app.success).toHaveBeenCalledTimes(1)
  })

  it("keeps the draft and binds a documented account marker to its own field", async () => {
    const app = await setup()
    await app.openCreate()
    await app.identity()
    await app.fill("#staff-email", "nueva@example.test")
    await app.toggleAccount()
    await app.fill("#staff-account-password", "Clave1234")
    await app.submit()
    app.http
      .expectOne(api)
      .flush(
        { errores: { passwordParaCuenta: "La contraseña es obligatoria" } },
        { status: 400, statusText: "Bad Request" }
      )
    await app.settle()
    expect(app.control<HTMLInputElement>("#staff-name").value).toContain("Colaboradora Nueva")
    expect(app.control<HTMLInputElement>("#staff-account-password").value).toBe("Clave1234")
    expect(app.control("#staff-account-password-error").textContent).toContain(
      "necesita una contraseña inicial"
    )
    expect(app.dialog()!.querySelector("div[role='alert']")).toBeNull()
    expect(app.success).not.toHaveBeenCalled()
  })

  it("binds a reserved email to the email input and any other failure to the general alert", async () => {
    const app = await setup()
    await app.openCreate()
    await app.identity()
    await app.fill("#staff-email", "repetido@example.test")
    await app.submit()
    app.http
      .expectOne(api)
      .flush({ errores: { correo: "EMAIL_RESERVED" } }, { status: 409, statusText: "Conflict" })
    await app.settle()
    expect(app.control("#staff-email-account-error").textContent).toContain(
      "ya pertenece a otra ficha o cuenta"
    )
    await app.submit()
    app.http
      .expectOne(api)
      .flush({ mensaje: "RAW INTERNAL DETAIL" }, { status: 409, statusText: "Conflict" })
    await app.settle()
    const alert = app.control("div[role='alert']")
    expect(alert.textContent).toContain("conflicto")
    expect(alert.textContent).not.toContain("RAW INTERNAL DETAIL")
    expect(app.dialog()).not.toBeNull()
  })
})
