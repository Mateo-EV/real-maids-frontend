import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { getDebugNode, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { BehaviorSubject, of, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { CUSTOMERS_ROUTES } from "../../../customers.routes"
import * as Actions from "../../../application/use-cases/acquisition.use-cases"
import { ACQUISITION_REPOSITORY } from "../../../domain/repositories/acquisition.repository"
import { AcquisitionRepositoryImpl } from "../../../infrastructure/repositories/acquisition.repository-impl"
import { Lead } from "../../../domain/entities/lead.entity"
import { CustomerType } from "../../../domain/entities/customer.entity"
import { CustomerError } from "../../../domain/errors/customer.error"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"

const record = (id = 7, converted = false) =>
  Lead.create(id, 11, 12, `Prospecto ${id}`, null, null, null, null, converted, new Date(0), null)
const dto = (patch = {}) => ({
  idCliente: 91,
  nombre: "Datos actuales del servidor",
  tipo: "comercial",
  correo: null,
  telefono: null,
  activo: false,
  idUsuario: null,
  fechaCreacion: "2026-01-01T00:00:00Z",
  fechaActualizacion: null,
  idProspecto: 7,
  identificacionFiscal: null,
  sistemaOrigen: null,
  idExterno: null,
  usuarioRegistro: null,
  ...patch
})
async function setup(server = false, converted = false) {
  const requests: Subject<Result<Lead, CustomerError>>[] = []
  const read = vi.fn(() => {
    const response = new Subject<Result<Lead, CustomerError>>()
    requests.push(response)
    return response
  })
  const list = vi.fn(() =>
    of(Result.success({ items: [record()], total: 1, offset: 0, limit: 20 }))
  )
  const forbidden = vi.fn(() => {
    throw new Error("Unexpected action")
  })
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "identity@example.test", null, Date.now() + 600000, 7)
  )
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: "admin/customers",
          children: CUSTOMERS_ROUTES.map(route => ({ ...route, canActivate: [] }))
        }
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: ACQUISITION_REPOSITORY, useExisting: AcquisitionRepositoryImpl },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      { provide: Actions.GetLeadUseCase, useValue: { execute: read } },
      { provide: Actions.ListLeadsUseCase, useValue: { execute: list } },
      ...[
        Actions.CreateLeadUseCase,
        Actions.UpdateLeadUseCase,
        Actions.ListLeadOriginsUseCase,
        Actions.ListFunnelStagesUseCase,
        Actions.ListLeadFollowUpsUseCase
      ].map(provide => ({ provide, useValue: { execute: forbidden } })),
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const harness = await RouterTestingHarness.create("/admin/customers/leads/7?offset=10&limit=5")
  const success = vi
    .spyOn(harness.routeDebugElement!.injector.get(HotToastService), "success")
    .mockImplementation(vi.fn())
  const http = TestBed.inject(HttpTestingController)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  const element = () => harness.routeNativeElement!
  const dialog = () => document.querySelector<HTMLElement>("app-lead-conversion-dialog")!
  const click = async (text: string, root: HTMLElement = element()) => {
    const button = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === text
    )
    expect(button, text).toBeDefined()
    button!.click()
    await settle()
  }
  const respond = async (
    value: Result<Lead, CustomerError> = Result.success(record(7, converted))
  ) => {
    requests.at(-1)!.next(value)
    requests.at(-1)!.complete()
    await settle()
  }
  const open = async () => {
    await respond()
    await click("Convertir a cliente")
  }
  const choose = async (value: string = CustomerType.RESIDENTIAL) => {
    const select = dialog().querySelector<HTMLSelectElement>("select")!
    select.value = value
    select.dispatchEvent(new Event("change", { bubbles: true }))
    select.dispatchEvent(new Event("blur"))
    await settle()
  }
  const submit = async () => {
    dialog()
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  const request = () => http.expectOne("http://localhost:8080/api/prospectos/7/conversion")
  const link = () => element().querySelector<HTMLAnchorElement>("a[data-converted-customer]")
  const overlay = () => getDebugNode(dialog())!.injector.get(CdkDialogRef).overlayRef
  await settle()
  return {
    harness,
    http,
    read,
    list,
    requests,
    forbidden,
    session,
    success,
    settle,
    element,
    dialog,
    click,
    respond,
    open,
    choose,
    submit,
    request,
    link,
    overlay
  }
}
afterEach(() => {
  TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true })
  vi.restoreAllMocks()
})

describe("T5 confirmed lead conversion S1–S2", () => {
  it("requires verified matching data, keeps edit in the header and opens one contextual explicit confirmation with blank real type choices", async () => {
    const s = await setup()
    expect(s.element().textContent).not.toContain("Convertir a cliente")
    await s.open()
    const header = s.element().querySelector("app-catalog-frame header")!
    expect(header.textContent).toContain("Editar prospecto")
    expect(header.textContent).toContain("Convertir a cliente")
    expect(document.querySelectorAll("app-lead-conversion-dialog")).toHaveLength(1)
    expect(document.querySelector("app-lead-editor")).toBeNull()
    expect(s.dialog().textContent).toContain("Prospecto 7 · ID 7")
    expect(s.dialog().textContent).toContain("datos actuales")
    expect(s.dialog().textContent).toContain("cliente vinculado")
    const select = s.dialog().querySelector("select")!
    expect(select.value).toBe("")
    expect([...select.options].map(o => o.value)).toEqual(["", ...Object.values(CustomerType)])
    await s.submit()
    expect(s.dialog().textContent).toContain("Selecciona el tipo de cliente")
    s.http.expectNone(req => req.method === "POST")
    const fake = document.createElement("option")
    fake.value = "inventado"
    select.append(fake)
    await s.choose("inventado")
    await s.submit()
    s.http.expectNone(req => req.method === "POST")
    expect(s.forbidden).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    "uses captured ID/type only; converted=%s still POSTs, accepts existing stored type and links the actual customer without lead paging",
    async converted => {
      const s = await setup(false, converted)
      const inbox = TestBed.inject(CustomerAcquisitionStore).observeLeads().subscribe()
      await s.open()
      await s.choose()
      await s.submit()
      const request = s.request()
      expect(request.request.method).toBe("POST")
      expect(request.request.body).toEqual({ tipo: CustomerType.RESIDENTIAL })
      expect(s.success).not.toHaveBeenCalled()
      expect(s.link()).toBeNull()
      request.flush(dto())
      await s.settle()
      expect(s.success).toHaveBeenCalledExactlyOnceWith("Conversión confirmada.")
      expect(s.link()?.getAttribute("href")).toBe("/admin/customers/91")
      expect(TestBed.inject(Router).url).toBe("/admin/customers/leads/7?offset=10&limit=5")
      expect(s.element().textContent).not.toMatch(/Cliente creado|nuevo cliente creado/i)
      expect(s.read).toHaveBeenCalledTimes(2)
      expect(s.list).toHaveBeenCalledTimes(2)
      await s.respond(Result.failure(new CustomerError("NETWORK")))
      expect(s.element().textContent).toContain("desactualizados")
      expect(s.link()).not.toBeNull()
      await s.click("Reintentar")
      expect(s.read).toHaveBeenCalledTimes(3)
      s.http.expectNone(req => req.method === "POST")
      expect(s.success).toHaveBeenCalledTimes(1)
      expect(s.element().querySelector("a")?.getAttribute("href")).toBe(
        "/admin/customers/leads?offset=10&limit=5"
      )
      expect(s.forbidden).not.toHaveBeenCalled()
      inbox.unsubscribe()
    }
  )

  it.each([
    { idProspecto: 8 },
    { idProspecto: null },
    { idCliente: 0 },
    { idCliente: 2147483648 },
    { tipo: "inventado" },
    { nombre: null }
  ])("rejects malformed/wrong-owner result %j without confirmation or link", async patch => {
    const s = await setup()
    await s.open()
    await s.choose()
    await s.submit()
    s.request().flush(dto(patch))
    await s.settle()
    expect(s.success).not.toHaveBeenCalled()
    expect(s.link()).toBeNull()
    expect(s.read).toHaveBeenCalledTimes(1)
    expect(s.dialog().querySelector("select")!.value).toBe(CustomerType.RESIDENTIAL)
    expect(s.dialog().querySelector("[role=alert]")).not.toBeNull()
  })

  it.each([403, 409, 0])(
    "retains target/type with safe inline %s error and only explicit retry",
    async status => {
      const s = await setup()
      await s.open()
      await s.choose(CustomerType.COMMERCIAL)
      await s.submit()
      s.request().flush({ message: "PRIVATE" }, { status, statusText: "Failed" })
      await s.settle()
      expect(s.success).not.toHaveBeenCalled()
      expect(s.link()).toBeNull()
      expect(s.dialog().querySelector("select")!.value).toBe(CustomerType.COMMERCIAL)
      expect(s.dialog().textContent).toContain("Prospecto 7 · ID 7")
      expect(s.dialog().textContent).not.toContain("PRIVATE")
      expect(s.dialog().querySelector("[role=alert]")).not.toBeNull()
      s.http.expectNone(req => req.method === "POST")
      await s.submit()
      expect(s.request().request.body).toEqual({ tipo: CustomerType.COMMERCIAL })
    }
  )

  it("blocks duplicate submissions, native dismissal and conflicting edit while pending, but permits idle dismissal", async () => {
    const s = await setup()
    await s.open()
    await s.choose()
    await s.submit()
    const request = s.request()
    await s.submit()
    await s.click("Editar prospecto")
    await s.click("Convertir a cliente")
    expect(document.querySelectorAll("app-lead-conversion-dialog")).toHaveLength(1)
    const cancel = [...s.dialog().querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === "Cancelar"
    )!
    expect(cancel.disabled).toBe(true)
    cancel.click()
    s.dialog().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    s.overlay().backdropElement!.click()
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    document.body.click()
    await s.settle()
    expect(s.dialog()).not.toBeNull()
    expect(document.querySelector("app-lead-editor")).toBeNull()
    s.http.expectNone(req => req.method === "POST")
    request.flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(cancel.disabled).toBe(false)
    const ref = getDebugNode(s.dialog())!.injector.get(BrnDialogRef)
    await s.click("Cancelar", s.dialog())
    expect(ref.open).toBe(false)
  })

  it.each(["escape", "backdrop", "outside"])(
    "allows idle %s dismissal and fences closing-animation submit",
    async dismissal => {
      const s = await setup()
      await s.open()
      await s.choose()
      const editor = s.dialog(),
        ref = getDebugNode(editor)!.injector.get(BrnDialogRef)
      if (dismissal === "escape")
        editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      if (dismissal === "backdrop") s.overlay().backdropElement!.click()
      if (dismissal === "outside") {
        document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
        document.body.click()
      }
      expect(ref.open).toBe(false)
      editor
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await s.settle()
      s.http.expectNone(req => req.method === "POST")
      expect(s.success).not.toHaveBeenCalled()
    }
  )

  it.each(["owner", "session", "destroy", "closing"])(
    "cancels/fences pending %s changes including closing animation",
    async event => {
      const s = await setup()
      await s.open()
      await s.choose()
      await s.submit()
      const request = s.request()
      if (event === "owner") {
        await s.harness.navigateByUrl("/admin/customers/leads/8")
        await s.settle()
      }
      if (event === "session") {
        s.session.next(
          AuthSession.create("Other", "other@example.test", null, Date.now() + 900000, 8)
        )
        await s.settle()
      }
      if (event === "destroy") s.harness.fixture.destroy()
      if (event === "closing") {
        getDebugNode(s.dialog())!.injector.get(BrnDialogRef).close()
        request.flush(dto())
      } else expect(request.cancelled).toBe(true)
      if (event !== "destroy") await s.settle()
      expect(s.success).not.toHaveBeenCalled()
      if (event !== "destroy") expect(s.link()).toBeNull()
    }
  )

  it("preserves pending work on same-session renewal and clears confirmed link on owner replacement", async () => {
    const s = await setup()
    await s.open()
    await s.choose()
    await s.submit()
    const request = s.request(),
      old = s.session.value!
    s.session.next(AuthSession.create(old.name, old.email, old.role, old.expiresAt, old.id))
    await s.settle()
    expect(request.cancelled).toBe(false)
    request.flush(dto())
    await s.settle()
    expect(s.link()).not.toBeNull()
    await s.harness.navigateByUrl("/admin/customers/leads/8")
    await s.settle()
    expect(s.link()).toBeNull()
    await s.respond(Result.success(record(8)))
    expect(s.link()).toBeNull()
  })

  it("dispatches every explicit repeat and retains server linkage rather than assuming a new customer or a type change", async () => {
    const s = await setup(false, true)
    await s.open()
    await s.choose()
    await s.submit()
    s.request().flush(dto())
    await s.settle()
    await s.respond(Result.success(record(7, true)))
    await s.click("Convertir a cliente")
    await s.choose(CustomerType.RESIDENTIAL)
    await s.submit()
    const repeat = s.request()
    expect(repeat.request.method).toBe("POST")
    expect(repeat.request.body).toEqual({ tipo: CustomerType.RESIDENTIAL })
    repeat.flush(dto())
    await s.settle()
    expect(s.link()?.getAttribute("href")).toBe("/admin/customers/91")
    expect(s.success).toHaveBeenCalledTimes(2)
    expect(s.element().textContent).not.toMatch(/creado|tipo actualizado/i)
  })

  it("does not offer conversion or dispatch for a mismatched loaded owner", async () => {
    const s = await setup()
    await s.respond(Result.success(record(8)))
    expect(s.element().textContent).not.toContain("Convertir a cliente")
    s.http.expectNone(req => req.method === "POST")
    expect(s.link()).toBeNull()
  })

  it.each(["route", "session"])(
    "clears post-Result linkage on %s replacement and suppresses feedback once replacement is observed",
    async replacement => {
      const s = await setup()
      await s.open()
      await s.choose()
      await s.submit()
      s.request().flush(dto())
      if (replacement === "session") s.session.next(null)
      else await s.harness.navigateByUrl("/admin/customers/leads/8")
      await s.settle()
      // Router navigation commits asynchronously; the confirmed old-owner result may
      // be delivered before that commit. Session emission is synchronous.
      if (replacement === "session") expect(s.success).not.toHaveBeenCalled()
      else {
        expect(s.success).toHaveBeenCalledExactlyOnceWith("Conversión confirmada.")
        await s.respond(Result.success(record(8)))
        expect(s.success).toHaveBeenCalledTimes(1)
      }
      expect(s.link()).toBeNull()
    }
  )

  it("rechecks session after route-local feedback before exposing a link", async () => {
    const s = await setup()
    await s.open()
    await s.choose()
    await s.submit()
    s.success.mockImplementation(vi.fn().mockImplementation(() => s.session.next(null)))
    s.request().flush(dto())
    await s.settle()
    expect(s.link()).toBeNull()
  })

  it("clears confirmed link on session replacement", async () => {
    const s = await setup()
    await s.open()
    await s.choose()
    await s.submit()
    s.request().flush(dto())
    await s.settle()
    expect(s.link()).not.toBeNull()
    s.session.next(null)
    await s.settle()
    expect(s.link()).toBeNull()
  })

  it("SSR has no action, dispatch, confirmation or link", async () => {
    const s = await setup(true)
    expect(s.read).not.toHaveBeenCalled()
    expect(s.element().textContent).not.toContain("Convertir a cliente")
    expect(s.link()).toBeNull()
    expect(s.success).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
  })
})
