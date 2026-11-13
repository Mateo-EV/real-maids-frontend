import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { ListFunnelStagesUseCase } from "../../../application/use-cases/acquisition.use-cases"
import { FunnelStage } from "../../../domain/entities/funnel-stage.entity"
import { CustomerError } from "../../../domain/errors/customer.error"
import { CrmStagesPage } from "./crm-stages-page"

type StageResult = Result<readonly FunnelStage[], CustomerError>

function setup(server = false) {
  const requests: Subject<StageResult>[] = []
  const load = vi.fn(() => {
    const response = new Subject<StageResult>()
    requests.push(response)
    return response
  })
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "identity@example.test", null, Date.now() + 600000, 7)
  )
  TestBed.configureTestingModule({
    imports: [CrmStagesPage],
    providers: [
      { provide: ListFunnelStagesUseCase, useValue: { execute: load } },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const fixture = TestBed.createComponent(CrmStagesPage)
  fixture.detectChanges()
  const element = fixture.nativeElement as HTMLElement
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const respond = async (value: StageResult) => {
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

describe("CrmStagesPage", () => {
  it("renders one read-only catalog frame with loading, then server rows on desktop and mobile", async () => {
    const s = setup()
    expect(s.load).toHaveBeenCalledOnce()
    expect(s.element.textContent).toContain("Cargando etapas")
    await s.respond(
      Result.success([
        FunnelStage.create(12, "Contactado", 1, false),
        FunnelStage.create(14, "Cerrado", 2, true)
      ])
    )
    const frame = s.element.querySelector("app-catalog-frame")!
    expect(
      frame.querySelector('section[aria-labelledby="crm-stages-title"]')?.getAttribute("aria-busy")
    ).toBe("false")
    expect(frame.querySelector("header h1")?.textContent).toContain("Etapas del embudo")
    expect([...frame.querySelectorAll("th")].map(th => th.textContent?.trim())).toEqual([
      "Etapa",
      "Orden",
      "Final"
    ])
    const table = frame.querySelector("[catalogDesktop] table")!
    expect(
      [...table.querySelectorAll("tbody tr")].map(row =>
        [...row.querySelectorAll("td")].map(cell => cell.textContent?.trim())
      )
    ).toEqual([
      ["Contactado", "1", "No"],
      ["Cerrado", "2", "Sí"]
    ])
    const cards = frame.querySelector("[catalogMobile]")!
    expect(cards.textContent).toContain("Cerrado")
    expect(cards.textContent).toContain("Final")
    expect(frame.querySelectorAll("button")).toHaveLength(0)
    expect(frame.textContent).not.toMatch(/Crear|Editar|Activar|Desactivar|Eliminar/)
    expect(frame.textContent).toContain("Catálogo de sólo lectura")
    expect(s.load).toHaveBeenCalledOnce()
  })

  it("surfaces a safe retryable error, keeps verified rows on a failed refresh and forces the retry", async () => {
    const s = setup()
    await s.respond(Result.failure(new CustomerError("FORBIDDEN")))
    expect(s.element.querySelector('[role="alert"]')?.textContent).toContain(
      "No se pudieron cargar las etapas."
    )
    await s.click("Reintentar etapas")
    expect(s.load).toHaveBeenCalledTimes(2)
    await s.respond(Result.success([FunnelStage.create(12, "Contactado", 1, false)]))
    expect(s.element.textContent).toContain("Contactado")
    s.fixture.componentInstance.retry()
    await s.settle()
    expect(s.element.textContent).toContain("Actualizando etapas…")
    expect(s.element.textContent).toContain("Contactado")
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element.textContent).toContain("No se pudieron actualizar las etapas.")
    expect(s.element.textContent).toContain("Contactado")
  })

  it("renders the verified empty catalog without inventing rows", async () => {
    const s = setup()
    await s.respond(Result.success([]))
    expect(s.element.textContent).toContain("No hay etapas registradas")
    expect(s.element.querySelector("[catalogDesktop] table")).toBeNull()
    expect(s.element.querySelectorAll("button")).toHaveLength(0)
  })

  it("does not dispatch a stage read during SSR", () => {
    const s = setup(true)
    expect(s.load).not.toHaveBeenCalled()
    expect(s.element.textContent).not.toContain("No hay etapas registradas")
    s.fixture.destroy()
  })
})
