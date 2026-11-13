import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { ListLeadOriginsUseCase } from "../../../application/use-cases/acquisition.use-cases"
import { LeadOrigin } from "../../../domain/entities/lead-origin.entity"
import { CustomerError } from "../../../domain/errors/customer.error"
import { CrmOriginsPage } from "./crm-origins-page"

type OriginResult = Result<readonly LeadOrigin[], CustomerError>

function setup(server = false) {
  const requests: Subject<OriginResult>[] = []
  const load = vi.fn(() => {
    const response = new Subject<OriginResult>()
    requests.push(response)
    return response
  })
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "identity@example.test", null, Date.now() + 600000, 7)
  )
  TestBed.configureTestingModule({
    imports: [CrmOriginsPage],
    providers: [
      { provide: ListLeadOriginsUseCase, useValue: { execute: load } },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const fixture = TestBed.createComponent(CrmOriginsPage)
  fixture.detectChanges()
  const element = fixture.nativeElement as HTMLElement
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const respond = async (value: OriginResult) => {
    requests.at(-1)!.next(value)
    requests.at(-1)!.complete()
    await settle()
  }
  const click = async (label: string) => {
    const button = [...element.querySelectorAll<HTMLButtonElement>("button")].find(
      item => item.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  return { fixture, element, requests, load, session, settle, respond, click }
}

afterEach(() => vi.restoreAllMocks())

describe("CrmOriginsPage", () => {
  it("renders one read-only catalog frame with loading, then server rows on desktop and mobile", async () => {
    const s = setup()
    expect(s.load).toHaveBeenCalledOnce()
    expect(s.element.textContent).toContain("Cargando orígenes")
    const frame = s.element.querySelector("app-catalog-frame")!
    expect(frame).not.toBeNull()
    expect(
      frame.querySelector('section[aria-labelledby="crm-origins-title"]')?.getAttribute("aria-busy")
    ).toBe("true")
    await s.respond(
      Result.success([
        LeadOrigin.create(11, "Formulario web", "Sitio web", true),
        LeadOrigin.create(13, "<b>Feria</b>", null, false)
      ])
    )
    expect(
      frame.querySelector('section[aria-labelledby="crm-origins-title"]')?.getAttribute("aria-busy")
    ).toBe("false")
    expect(frame.querySelector("header h1")?.textContent).toContain("Orígenes de prospecto")
    expect([...frame.querySelectorAll("th")].map(th => th.textContent?.trim())).toEqual([
      "Origen",
      "Descripción",
      "Estado"
    ])
    const table = frame.querySelector("[catalogDesktop] table")!
    expect(
      [...table.querySelectorAll("tbody tr")].map(row =>
        [...row.querySelectorAll("td")].map(cell => cell.textContent?.trim())
      )
    ).toEqual([
      ["Formulario web", "Sitio web", "Activo"],
      ["<b>Feria</b>", "Sin descripción", "Inactivo"]
    ])
    const cards = frame.querySelector("[catalogMobile]")!
    expect(cards.textContent).toContain("Feria")
    expect(cards.querySelector("b")).toBeNull()
    expect(frame.querySelectorAll("button")).toHaveLength(0)
    expect(frame.textContent).not.toMatch(/Crear|Editar|Activar|Desactivar|Eliminar/)
    expect(frame.textContent).toContain("Catálogo de sólo lectura")
    expect(s.load).toHaveBeenCalledOnce()
  })

  it("surfaces a safe retryable error, keeps verified rows on a failed refresh and forces the retry", async () => {
    const s = setup()
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element.querySelector('[role="alert"]')?.textContent).toContain(
      "No se pudieron cargar los orígenes."
    )
    expect(s.element.querySelector('[role="alert"]')?.textContent).not.toContain(
      "Customer service unavailable"
    )
    await s.click("Reintentar orígenes")
    expect(s.load).toHaveBeenCalledTimes(2)
    await s.respond(Result.success([LeadOrigin.create(11, "Formulario web", "Sitio web", true)]))
    expect(s.element.textContent).toContain("Formulario web")
    s.fixture.componentInstance.retry()
    await s.settle()
    expect(s.element.textContent).toContain("Actualizando orígenes…")
    expect(s.element.textContent).toContain("Formulario web")
    expect(s.load).toHaveBeenCalledTimes(3)
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element.textContent).toContain("No se pudieron actualizar los orígenes.")
    expect(s.element.textContent).toContain("Formulario web")
  })

  it("renders the verified empty catalog without inventing rows", async () => {
    const s = setup()
    await s.respond(Result.success([]))
    expect(s.element.textContent).toContain("No hay orígenes registrados")
    expect(s.element.querySelector("[catalogDesktop] table")).toBeNull()
    expect(s.element.textContent).not.toContain("No se pudieron cargar los orígenes.")
    expect(s.element.querySelectorAll("button")).toHaveLength(0)
  })

  it("does not dispatch an origin read during SSR", () => {
    const s = setup(true)
    expect(s.load).not.toHaveBeenCalled()
    expect(s.element.textContent).not.toContain("No hay orígenes registrados")
    s.fixture.destroy()
  })
})
