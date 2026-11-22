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
import { ROLE_REPOSITORY } from "@/app/features/users/domain/repositories/role.repository"
import { USER_REPOSITORY } from "@/app/features/users/domain/repositories/user.repository"
import { RoleRepositoryImpl } from "@/app/features/users/infrastructure/repositories/role.repository-impl"
import { UserRepositoryImpl } from "@/app/features/users/infrastructure/repositories/user.repository-impl"
import { provideFieldOperationsReads } from "../../../field-operations.providers"
import { FieldOperationsError } from "../../../domain/errors/field-operations.error"
import { staffDto } from "../../../infrastructure/source/field-staff-http.validation"
import { FieldStaffStore } from "../../state/field-staff.store"
import { StaffDetailPage } from "./staff-detail-page"

const api = "http://localhost:8080/api/personal"
const usersApi = "http://localhost:8080/api/usuarios"
const rolesApi = "http://localhost:8080/api/roles"
const deadline = 4102444800000
const role = {
  idRol: 4,
  nombre: "PERSONAL_CAMPO",
  descripcion: "Personal de campo",
  activo: true,
  fechaCreacion: "2026-01-01T12:00:00Z"
}
const profile = (userId: number | null, accountEmail?: string | null) => ({
  idPersonal: 7,
  nombre: "Colaboradora Verificada",
  documento: "DOC-7",
  telefono: null,
  correo: null,
  idioma: "es",
  fechaIngreso: "2024-02-29",
  activo: true,
  idUsuario: userId,
  ...(accountEmail === undefined ? {} : { correoUsuario: accountEmail }),
  disponibilidad: [],
  fechaCreacion: "2026-01-01T12:00:00Z"
})
const account = (id: number, name: string, email: string) => ({
  idUsuario: id,
  nombre: name,
  correo: email,
  idRol: 4,
  idioma: "es",
  activo: true,
  ultimoAcceso: null,
  fechaCreacion: "2026-01-01T12:00:00Z",
  fechaActualizacion: "2026-01-01T12:00:00Z"
})
const page = (
  contenido: unknown[],
  pagina = 0,
  tamanio = 10,
  totalElementos = contenido.length
) => ({
  contenido,
  pagina,
  tamanio,
  totalElementos,
  totalPaginas: Math.ceil(totalElementos / tamanio)
})

/** The dialog's own primary action, whichever label pending has replaced. */
const primary = (within: ParentNode) =>
  [...within.querySelectorAll<HTMLButtonElement>("button")].at(-1)!

async function setup(userId: number | null = null) {
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Caller", "caller@example.test", null, deadline, 19)
  )
  const success = vi.fn((message: string) => message)
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: "admin/staff/:id", component: StaffDetailPage }]),
      provideFieldOperationsReads(),
      { useExisting: UserRepositoryImpl, provide: USER_REPOSITORY },
      { useExisting: RoleRepositoryImpl, provide: ROLE_REPOSITORY },
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
  const harness = await RouterTestingHarness.create()
  const router = TestBed.inject(Router)
  await router.navigateByUrl("/admin/staff/7")
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = () => harness.routeNativeElement!
  const dialog = (selector: string) => document.querySelector<HTMLElement>(selector)
  const click = async (label: string, within: ParentNode = element()) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label || b.getAttribute("aria-label") === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  const respondProfile = async (dto = profile(userId)) => {
    const request = http.expectOne(`${api}/7`)
    expect(request.request.method).toBe("GET")
    request.flush(dto)
    await settle()
  }
  /** The selector resolves the PERSONAL_CAMPO role and reads one filtered, active users page. */
  const openLink = async () => {
    await click("Vincular cuenta")
    http.expectOne(rolesApi).flush([role])
    await settle()
    const accounts = http.expectOne(r => r.url.endsWith("/usuarios"))
    return accounts
  }
  return {
    http,
    store,
    settle,
    element,
    dialog,
    click,
    respondProfile,
    openLink,
    session,
    success
  }
}

describe("WP11 staff account section", () => {
  // Every test here drives the component through HTTP; the decoder suite below does not.
  afterEach(() => TestBed.inject(HttpTestingController).verify())

  it("offers linking when the record has no account, without inventing an identity", async () => {
    const app = await setup(null)
    await app.respondProfile()
    const section = app.element().querySelector("[data-staff-account]")!
    expect(section.getAttribute("data-staff-account")).toBe("none")
    expect(section.textContent).toContain("Sin cuenta de acceso")
    expect(section.textContent).not.toContain("@")
    expect(section.textContent).toContain("Vincular cuenta")
    expect(section.textContent).not.toContain("Desvincular cuenta")
    app.http.expectNone(() => true)
  })

  it("offers unlinking for a linked record without inventing an email", async () => {
    const app = await setup(31)
    await app.respondProfile()
    const section = app.element().querySelector("[data-staff-account]")!
    expect(section.getAttribute("data-staff-account")).toBe("linked")
    expect(section.textContent).toContain("Cuenta vinculada")
    expect(section.textContent).not.toContain("31")
    expect(section.textContent).toContain("Correo de la cuenta no disponible")
    expect(section.textContent).not.toContain("@")
    expect(section.textContent).toContain("Desvincular cuenta")
    expect(section.textContent).not.toContain("Vincular cuenta")
    app.http.expectNone(() => true)
  })

  it("prints the linked account email instead of the bare identifier", async () => {
    const app = await setup(31)
    await app.respondProfile(profile(31, "vinculada@example.test"))
    const section = app.element().querySelector("[data-staff-account]")!
    expect(section.getAttribute("data-staff-account")).toBe("linked")
    expect(section.textContent).toContain("Cuenta vinculada")
    expect(section.textContent).toContain("vinculada@example.test")
    expect(section.textContent).not.toContain("31")
    expect(section.textContent).not.toContain("Correo de la cuenta no disponible")
    expect(section.textContent).toContain("Desvincular cuenta")
    app.http.expectNone(() => true)
  })

  it("reads exactly one bounded staff page for the linkage index and marks a linked account unavailable", async () => {
    const app = await setup(null)
    await app.respondProfile()
    const accounts = await app.openLink()
    // Documented server filters: the resolved PERSONAL_CAMPO role and active accounts, page 0.
    expect(accounts.request.method).toBe("GET")
    expect(accounts.request.params.get("idRol")).toBe("4")
    expect(accounts.request.params.get("activo")).toBe("true")
    expect(accounts.request.params.get("pagina")).toBe("0")
    expect(accounts.request.params.get("tamanio")).toBe("10")
    const index = app.http.expectOne(`${api}?pagina=0&tamanio=100`)
    expect(index.request.method).toBe("GET")
    index.flush(page([{ ...profile(31), idPersonal: 12 }], 0, 100, 1))
    accounts.flush(
      page([
        account(31, "Cuenta Vinculada", "vinculada@example.test"),
        account(44, "Cuenta Libre", "libre@example.test")
      ])
    )
    await app.settle()
    const dialog = app.dialog("app-staff-account-link-dialog")!
    expect(dialog.textContent).toContain("Cuenta Vinculada")
    expect(dialog.textContent).toContain("vinculada@example.test")
    expect(dialog.textContent).toContain("Ya vinculada a otra ficha de personal")
    const radios = [...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    expect(radios[0].disabled).toBe(true)
    expect(radios[1].disabled).toBe(false)
  })

  it("pages the account selector on the server, keeping the documented filters", async () => {
    const app = await setup(null)
    await app.respondProfile()
    const accounts = await app.openLink()
    app.http.expectOne(`${api}?pagina=0&tamanio=100`).flush(page([], 0, 100, 0))
    accounts.flush(
      page(
        Array.from({ length: 10 }, (_v, index) =>
          account(100 + index, `Cuenta ${100 + index}`, `cuenta${100 + index}@example.test`)
        ),
        0,
        10,
        20
      )
    )
    await app.settle()
    const next = app
      .dialog("app-staff-account-link-dialog")!
      .querySelectorAll<HTMLButtonElement>("button")
    const forward = [...next].find(b => b.textContent?.trim() === "Siguiente")!
    expect(forward.disabled).toBe(false)
    forward.click()
    await app.settle()
    const second = app.http.expectOne(r => r.url.endsWith("/usuarios"))
    expect(second.request.params.get("pagina")).toBe("1")
    expect(second.request.params.get("tamanio")).toBe("10")
    expect(second.request.params.get("idRol")).toBe("4")
    expect(second.request.params.get("activo")).toBe("true")
    second.flush(
      page(
        Array.from({ length: 10 }, (_v, index) =>
          account(110 + index, `Otra Cuenta ${110 + index}`, `otra${110 + index}@example.test`)
        ),
        1,
        10,
        20
      )
    )
    await app.settle()
    expect(app.dialog("app-staff-account-link-dialog")!.textContent).toContain("Otra Cuenta 110")
  })

  it("keeps account loading, verified empty and error states independent with their own retry", async () => {
    const app = await setup(null)
    await app.respondProfile()
    const accounts = await app.openLink()
    app.http.expectOne(`${api}?pagina=0&tamanio=100`).flush(page([], 0, 100, 0))
    const dialog = () => app.dialog("app-staff-account-link-dialog")!
    expect(dialog().textContent).toContain("Cargando cuentas")
    accounts.flush({ mensaje: "privado" }, { status: 403, statusText: "Forbidden" })
    await app.settle()
    expect(dialog().textContent).toContain("No se pudieron consultar las cuentas")
    expect(dialog().textContent).not.toContain("privado")
    expect(dialog().textContent).not.toContain("Sin cuentas PERSONAL_CAMPO activas")
    await app.click("Reintentar cuentas", dialog())
    app.http.expectOne(r => r.url.endsWith("/usuarios")).flush(page([]))
    await app.settle()
    expect(dialog().textContent).toContain("Sin cuentas PERSONAL_CAMPO activas")
    expect(dialog().textContent).not.toContain("No se pudieron consultar las cuentas")
  })
})

describe("WP11 staff account writes", () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify())

  it("sends one link for the chosen verified account, then emits one message and one forced read", async () => {
    const app = await setup(null)
    await app.respondProfile()
    const accounts = await app.openLink()
    app.http.expectOne(`${api}?pagina=0&tamanio=100`).flush(page([], 0, 100, 0))
    accounts.flush(page([account(44, "Cuenta Libre", "libre@example.test")]))
    await app.settle()
    const dialog = () => app.dialog("app-staff-account-link-dialog")!
    dialog().querySelector<HTMLInputElement>('input[type="radio"]')!.click()
    await app.settle()
    await app.click("Vincular cuenta", dialog())
    const write = app.http.expectOne(`${api}/7/cuenta`)
    expect(write.request.method).toBe("PUT")
    expect(write.request.body).toEqual({ idUsuario: 44 })
    // Nothing is optimised while the write is in flight.
    expect(app.store.selectStaffById(7).result?.userId).toBeNull()
    expect(primary(dialog()).disabled).toBe(true)
    write.flush(profile(44))
    await app.settle()
    // Only the confirmed success causes the single fresh read; the record is not patched.
    const reread = app.http.expectOne(`${api}/7`)
    expect(reread.request.method).toBe("GET")
    reread.flush(profile(44))
    await app.settle()
    expect(app.element().querySelector("[data-staff-account]")!.textContent).toContain(
      "Cuenta vinculada"
    )
    expect(app.success).toHaveBeenCalledExactlyOnceWith("Cuenta vinculada correctamente.")
    app.http.expectNone(() => true)
  })

  it("blocks a duplicate link and every dismissal while pending, keeping the refusal inline", async () => {
    const app = await setup(null)
    await app.respondProfile()
    const accounts = await app.openLink()
    app.http.expectOne(`${api}?pagina=0&tamanio=100`).flush(page([], 0, 100, 0))
    accounts.flush(page([account(44, "Cuenta Libre", "libre@example.test")]))
    await app.settle()
    const dialog = () => app.dialog("app-staff-account-link-dialog")!
    dialog().querySelector<HTMLInputElement>('input[type="radio"]')!.click()
    await app.settle()
    await app.click("Vincular cuenta", dialog())
    const write = app.http.expectOne(`${api}/7/cuenta`)
    // Pending blocks a duplicate submit and both dismissal paths.
    expect(primary(dialog()).disabled).toBe(true)
    primary(dialog()).click()
    await app.settle()
    dialog().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
    )
    await app.settle()
    app.http.expectNone(r => r.method === "PUT")
    await app.click("Cancelar", dialog())
    const cdk = getDebugNode(dialog())!.injector.get(CdkDialogRef)
    cdk.overlayRef.backdropElement!.click()
    await app.settle()
    expect(app.dialog("app-staff-account-link-dialog")).not.toBeNull()
    write.flush(
      { mensaje: "La cuenta ya está vinculada al colaborador Otro Nombre" },
      { status: 409, statusText: "Conflict" }
    )
    await app.settle()
    expect(dialog().textContent).toContain("La cuenta ya está vinculada a otra ficha de personal")
    expect(dialog().textContent).not.toContain("Otro Nombre")
    expect(app.dialog("app-staff-account-link-dialog")).not.toBeNull()
    expect(app.success).not.toHaveBeenCalled()
    app.http.expectNone(r => r.method === "GET" && r.url === `${api}/7`)
  })

  it("unlinks only after explicit confirmation naming the collaborator, then reads once", async () => {
    const app = await setup(31)
    await app.respondProfile(profile(31))
    await app.click("Desvincular cuenta")
    const dialog = () => app.dialog("app-staff-account-unlink-dialog")!
    expect(dialog().textContent).toContain("Colaboradora Verificada")
    expect(dialog().textContent).toContain("dejará de ver los servicios")
    expect(dialog().textContent).toContain("Las asignaciones")
    expect(dialog().textContent).toMatch(/no se cierran las sesiones/i)
    expect(dialog().textContent).toMatch(/ni se desactiva la cuenta/i)
    await app.click("Desvincular cuenta", dialog())
    const write = app.http.expectOne(`${api}/7/cuenta`)
    expect(write.request.method).toBe("PUT")
    expect(write.request.body).toEqual({ idUsuario: null })
    expect(primary(dialog()).disabled).toBe(true)
    primary(dialog()).click()
    await app.settle()
    app.http.expectNone(r => r.method === "PUT")
    write.flush(profile(null))
    await app.settle()
    app.http.expectOne(`${api}/7`).flush(profile(null))
    await app.settle()
    expect(app.element().querySelector("[data-staff-account]")!.textContent).toContain(
      "Sin cuenta de acceso"
    )
    expect(app.success).toHaveBeenCalledExactlyOnceWith("Cuenta desvinculada correctamente.")
    app.http.expectNone(() => true)
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
