import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Subject } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { ListSupportRequestsUseCase } from "../../../application/use-cases/customer-support-read.use-cases"
import { CustomerSupportError } from "../../../domain/errors/customer-support.error"
import { SupportRequestView } from "../../../domain/models/support-views"
import { SupportRequestQuery } from "../../../domain/params/customer-support.params"
import { SupportMetrics } from "./support-metrics"

type Page = PaginationResponse<SupportRequestView>

/**
 * The KPI block reads one server total per card: the three documented state codes and
 * the whole inbox. No filter key of the page ever appears here.
 */
const queries: SupportRequestQuery[] = [
  { offset: 0, limit: 1, state: "RECIBIDA" },
  { offset: 0, limit: 1, state: "EN_REVISION" },
  { offset: 0, limit: 1, state: "RESUELTA" },
  { offset: 0, limit: 1 }
]
const labels = ["Recibidas", "En revisión", "Resueltas", "Total de atenciones"]

interface Call {
  readonly query: SupportRequestQuery
  readonly response: Subject<Result<Page, CustomerSupportError>>
}

function configure(platform: "browser" | "server") {
  const calls: Call[] = []
  const execute = vi.fn((query: SupportRequestQuery) => {
    const response = new Subject<Result<Page, CustomerSupportError>>()
    calls.push({ query, response })
    return response
  })
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "identity@example.test", null, Date.now() + 600000, 7)
  )
  TestBed.configureTestingModule({
    providers: [
      { provide: ListSupportRequestsUseCase, useValue: { execute } },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      { provide: PLATFORM_ID, useValue: platform }
    ]
  })
  return { calls, execute }
}

function mount(platform: "browser" | "server" = "browser") {
  const state = configure(platform)
  const fixture = TestBed.createComponent(SupportMetrics)
  fixture.detectChanges()
  const element = fixture.nativeElement as HTMLElement
  const detect = () => fixture.detectChanges()
  const cards = () => [...element.querySelectorAll<HTMLElement>(".catalog-metrics article")]
  const values = () => cards().map(card => card.querySelector(".kpi-value")?.textContent?.trim())
  /** One settlement per recorded read; an empty sample deliberately differs from the total. */
  const succeed = (index: number, total: number) => {
    state.calls[index].response.next(Result.success({ items: [], total, offset: 0, limit: 1 }))
    state.calls[index].response.complete()
    detect()
  }
  const reject = (index: number) => {
    state.calls[index].response.next(Result.failure(new CustomerSupportError("UNAVAILABLE")))
    state.calls[index].response.complete()
    detect()
  }
  return { ...state, fixture, element, cards, values, succeed, reject, detect }
}

describe("SupportMetrics KPI block", () => {
  it("renders four unverified cards and observes only the exact four server totals", () => {
    const s = mount()
    expect(s.values()).toEqual(["—", "—", "—", "—"])
    expect(s.cards().map(card => card.querySelector(".kpi-label")?.textContent?.trim())).toEqual(
      labels
    )
    expect(
      s.cards().map(card => card.querySelector(".kpi-tile")?.getAttribute("data-kpi-tone"))
    ).toEqual(["navy", "amber", "green", "blue"])
    expect(s.execute.mock.calls).toEqual(queries.map(query => [query]))
  })

  it("renders each server total independently and keeps a verified zero as data", () => {
    const s = mount()
    s.succeed(0, 12)
    s.succeed(1, 0)
    s.succeed(2, 7)
    s.succeed(3, 156)
    expect(s.values()).toEqual(["12", "0", "7", "156"])
    expect(s.cards()[1].textContent).toContain("Del total del servidor")
  })

  it("keeps a failed card retryable with one forced read per attempt", () => {
    const s = mount()
    s.succeed(2, 7)
    s.reject(0)
    expect(s.cards()[0].textContent).toContain("No se pudo cargar el total de Recibidas.")
    expect(s.values()[0]).toBe("—")
    // The verified neighbour is not affected by its failed sibling.
    expect(s.values()[2]).toBe("7")

    const retry = [...s.cards()[0].querySelectorAll("button")].find(
      button => button.textContent?.trim() === "Reintentar Recibidas"
    )
    expect(retry).toBeDefined()
    retry!.click()
    s.detect()

    expect(s.calls).toHaveLength(5)
    expect(s.calls[4].query).toEqual(queries[0])
    s.succeed(4, 12)
    expect(s.values()[0]).toBe("12")
    expect(s.cards()[0].textContent).not.toContain("No se pudo cargar el total")
  })

  it("dispatches no read on the server platform", () => {
    const s = mount("server")
    expect(s.execute).not.toHaveBeenCalled()
    expect(s.values()).toEqual(["—", "—", "—", "—"])
  })
})
