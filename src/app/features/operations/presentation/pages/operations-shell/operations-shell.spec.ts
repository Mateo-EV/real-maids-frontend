import { Component, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, Subject } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { ListServiceRequestsUseCase } from "../../../application/use-cases/service-request-read.use-cases"
import { ListServiceOrdersUseCase } from "../../../application/use-cases/service-order-read.use-cases"
import {
  ServiceRequestSummary,
  ServiceOrderSummary
} from "../../../domain/models/operations-read.models"
import { ServiceRequestQuery, ServiceOrderQuery } from "../../../domain/params/operations.params"
import { OperationsError } from "../../../domain/errors/operations.error"
import { ServiceRequestsStore } from "../../state/service-requests.store"
import { ServiceOrdersStore } from "../../state/service-orders.store"
import { OperationsShell } from "./operations-shell"

@Component({ template: "Solicitudes ruteadas" })
class RequestsStub {}
@Component({ template: "Órdenes ruteadas" })
class OrdersStub {}

const queries = [
  { offset: 0, limit: 1, status: "registrada" },
  { offset: 0, limit: 1, status: "PENDIENTE" },
  { offset: 0, limit: 1, status: "PROGRAMADA" },
  { offset: 0, limit: 1, status: "EN_PROCESO" }
]
const labels = [
  "Solicitudes por atender",
  "Órdenes por programar",
  "Órdenes programadas",
  "Órdenes en proceso"
]

function configure(server = false) {
  function reader<T, Q>() {
    const calls: { query: Q; response: Subject<Result<PaginationResponse<T>, OperationsError>> }[] =
      []
    const execute = vi.fn((query: Q) => {
      const response = new Subject<Result<PaginationResponse<T>, OperationsError>>()
      calls.push({ query, response })
      return response
    })
    return { calls, execute }
  }
  const requests = reader<ServiceRequestSummary, ServiceRequestQuery>()
  const orders = reader<ServiceOrderSummary, ServiceOrderQuery>()
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "identity@example.test", null, Date.now() + 600000, 7)
  )
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: "admin/operations",
          component: OperationsShell,
          children: [
            { path: "requests", component: RequestsStub },
            { path: "orders", component: OrdersStub }
          ]
        }
      ]),
      { provide: ListServiceRequestsUseCase, useValue: requests },
      { provide: ListServiceOrdersUseCase, useValue: orders },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const pending = (index: number) =>
    index === 0
      ? requests.calls.at(-1)!.response
      : orders.calls.filter(call => call.query.status === queries[index].status).at(-1)!.response
  function succeed(index: number, total: number) {
    // An empty sample deliberately differs from the total: the shell must never count rows.
    pending(index).next(Result.success({ items: [], total, offset: 0, limit: 1 }))
    pending(index).complete()
  }
  function fail(index: number) {
    pending(index).next(Result.failure(new OperationsError("UNAVAILABLE", "private failure")))
    pending(index).complete()
  }
  return { requests, orders, session, pending, succeed, fail }
}
async function mount() {
  const state = configure()
  const harness = await RouterTestingHarness.create("/admin/operations/requests")
  const element = harness.routeNativeElement as HTMLElement
  const settle = async () => {
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  const cards = () => [...element.querySelectorAll<HTMLElement>(".catalog-metrics article")]
  const values = () => cards().map(card => card.querySelector(".kpi-value")?.textContent?.trim())
  return { ...state, harness, element, settle, cards, values }
}

describe("OperationsShell KPIs (T5/S7)", () => {
  it("renders four unverified cards and observes only the exact four server queries", async () => {
    const s = await mount()
    expect(s.values()).toEqual(["—", "—", "—", "—"])
    expect(s.cards().map(card => card.querySelector(".kpi-label")?.textContent?.trim())).toEqual(
      labels
    )
    expect(
      s.cards().map(card => card.querySelector(".kpi-tile")?.getAttribute("data-kpi-tone"))
    ).toEqual(["navy", "amber", "green", "blue"])
    expect(s.requests.execute.mock.calls).toEqual([[queries[0]]])
    expect(s.orders.execute.mock.calls).toEqual(queries.slice(1).map(query => [query]))
  })

  it("renders each server total independently, including verified zero", async () => {
    const s = await mount()
    const totals = [83, 27, 0, 51]
    for (let index = 0; index < 4; index++) {
      s.succeed(index, totals[index])
      await s.settle()
      expect(s.values()).toEqual(
        totals.map((total, position) => (position <= index ? String(total) : "—"))
      )
    }
  })

  it.each([0, 1, 2, 3])(
    "retries card %i alone and retains its total on failed forced revalidation",
    async index => {
      const s = await mount()
      s.fail(index)
      await s.settle()
      expect(s.values()[index]).toBe("—")
      const retry = () => s.cards()[index].querySelector<HTMLButtonElement>("button")!
      expect(s.cards()[index].textContent).toContain("No se pudo cargar")
      expect(retry().textContent).toContain(labels[index])
      retry().click()
      await s.settle()
      expect(s.requests.calls.length).toBe(index === 0 ? 2 : 1)
      expect(s.orders.calls.length).toBe(index === 0 ? 3 : 4)
      s.succeed(index, 0)
      await s.settle()
      // A new consumer forces the same public query, as confirmed-write invalidation may also do.
      const subscription =
        index === 0
          ? TestBed.inject(ServiceRequestsStore).observeRequests(queries[index], true).subscribe()
          : TestBed.inject(ServiceOrdersStore).observeOrders(queries[index], true).subscribe()
      await s.settle()
      expect(s.values()[index]).toBe("0")
      expect(s.cards()[index].textContent).toContain("Actualizando…")
      s.fail(index)
      await s.settle()
      expect(s.values()[index]).toBe("0")
      expect(s.cards()[index].textContent).toContain(
        "Las estadísticas pueden estar desactualizadas."
      )
      expect(s.cards()[index].textContent).not.toContain("Actualizando…")
      const counts = [s.requests.calls.length, s.orders.calls.length]
      retry().click()
      await s.settle()
      expect([s.requests.calls.length, s.orders.calls.length]).toEqual([
        counts[0] + (index === 0 ? 1 : 0),
        counts[1] + (index === 0 ? 0 : 1)
      ])
      expect(retry().disabled).toBe(true)
      s.fail(index)
      await s.settle()
      expect(s.values()[index]).toBe("0")
      subscription.unsubscribe()
    }
  )

  it("keeps metrics as an outlet sibling across real tab navigation without another read", async () => {
    const s = await mount()
    for (let index = 0; index < 4; index++) s.succeed(index, index + 10)
    await s.settle()
    const metrics = s.element.querySelector(".catalog-metrics")!
    expect(metrics.parentElement).toBe(s.element.querySelector("router-outlet")!.parentElement)
    const card = metrics.firstElementChild
    s.element.querySelector<HTMLAnchorElement>('a[href="/admin/operations/orders"]')!.click()
    await s.settle()
    expect(s.element.textContent).toContain("Órdenes ruteadas")
    expect(s.element.querySelector(".catalog-metrics")).toBe(metrics)
    expect(metrics.firstElementChild).toBe(card)
    expect(s.values()).toEqual(["10", "11", "12", "13"])
    expect(s.requests.execute).toHaveBeenCalledOnce()
    expect(s.orders.execute).toHaveBeenCalledTimes(3)
  })

  it("preserves renewal, clears and cancels on replacement, and releases reads on destruction", async () => {
    const s = await mount()
    const pending = Array.from({ length: 4 }, (_, index) => s.pending(index))
    const current = s.session.value!
    s.session.next(
      AuthSession.create(current.name, current.email, current.role, current.expiresAt, current.id)
    )
    await s.settle()
    expect(pending.every(read => read.observed)).toBe(true)
    s.succeed(0, 12)
    await s.settle()
    expect(s.values()[0]).toBe("12")
    s.session.next(AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8))
    await s.settle()
    expect(pending.every(read => !read.observed)).toBe(true)
    expect(s.values()).toEqual(["—", "—", "—", "—"])
    expect(s.requests.calls).toHaveLength(1)
    expect(s.orders.calls).toHaveLength(3)
    s.harness.fixture.destroy()
  })

  it("dispatches no reads or auth observation during SSR", () => {
    const s = configure(true)
    const observe = vi.spyOn(TestBed.inject(ObserveAuthSessionUseCase), "execute")
    const fixture = TestBed.createComponent(OperationsShell)
    fixture.detectChanges()
    expect(s.requests.execute).not.toHaveBeenCalled()
    expect(s.orders.execute).not.toHaveBeenCalled()
    expect(observe).not.toHaveBeenCalled()
    expect(
      [...fixture.nativeElement.querySelectorAll(".kpi-value")].map((value: unknown) =>
        (value as HTMLElement).textContent?.trim()
      )
    ).toEqual(["—", "—", "—", "—"])
    fixture.destroy()
  })
})
