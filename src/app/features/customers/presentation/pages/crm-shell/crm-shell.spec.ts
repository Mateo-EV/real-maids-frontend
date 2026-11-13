import { Component, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { GetLeadStatisticsUseCase } from "../../../application/use-cases/acquisition.use-cases"
import { GetCustomerStatisticsUseCase } from "../../../application/use-cases/get-customer-statistics.use-case"
import { ClienteEstadisticas } from "../../../domain/params/cliente-estadisticas.params"
import { ProspectoEstadisticas } from "../../../domain/params/prospecto-estadisticas.params"
import { CustomerError } from "../../../domain/errors/customer.error"
import { CrmShell } from "./crm-shell"

@Component({ selector: "app-clientes-stub", template: "<p>Clientes ruteados</p>" })
class ClientesStub {}

@Component({ selector: "app-prospectos-stub", template: "<p>Prospectos ruteados</p>" })
class ProspectosStub {}

type CustomerStatisticsResult = Result<ClienteEstadisticas, CustomerError>
type LeadStatisticsResult = Result<ProspectoEstadisticas, CustomerError>
const customerTotals: ClienteEstadisticas = { total: 32, activos: 30, inactivos: 2 }
const leadTotals: ProspectoEstadisticas = { total: 45, convertidos: 5, pendientes: 40 }

function configure(server = false) {
  const customerRequests: Subject<CustomerStatisticsResult>[] = []
  const leadRequests: Subject<LeadStatisticsResult>[] = []
  const readCustomers = vi.fn(() => {
    const response = new Subject<CustomerStatisticsResult>()
    customerRequests.push(response)
    return response
  })
  const readLeads = vi.fn(() => {
    const response = new Subject<LeadStatisticsResult>()
    leadRequests.push(response)
    return response
  })
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "identity@example.test", null, Date.now() + 600000, 7)
  )
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: "admin/customers",
          component: CrmShell,
          children: [
            { path: "", component: ClientesStub },
            { path: "leads", component: ProspectosStub }
          ]
        }
      ]),
      { provide: GetCustomerStatisticsUseCase, useValue: { execute: readCustomers } },
      { provide: GetLeadStatisticsUseCase, useValue: { execute: readLeads } },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const respondCustomers = async (value: CustomerStatisticsResult) => {
    customerRequests.at(-1)!.next(value)
    customerRequests.at(-1)!.complete()
    await Promise.resolve()
  }
  const respondLeads = async (value: LeadStatisticsResult) => {
    leadRequests.at(-1)!.next(value)
    leadRequests.at(-1)!.complete()
    await Promise.resolve()
  }
  return {
    customerRequests,
    leadRequests,
    readCustomers,
    readLeads,
    session,
    respondCustomers,
    respondLeads
  }
}

function cards(element: HTMLElement) {
  const metrics = element.querySelector(".catalog-metrics")!
  return {
    metrics,
    articles: [...metrics.querySelectorAll("article")],
    labels: [...metrics.querySelectorAll(".kpi-label")].map(label => label.textContent?.trim()),
    values: () =>
      [...metrics.querySelectorAll(".kpi-value")].map(value => value.textContent?.trim()),
    description: (index: number) =>
      metrics
        .querySelectorAll("[hlmCardDescription]")
        [index].textContent?.replace(/\s+/g, " ")
        .trim()
  }
}

async function mount() {
  const state = configure()
  const harness = await RouterTestingHarness.create("/admin/customers")
  const element = harness.routeNativeElement as HTMLElement
  const shell = () => harness.routeDebugElement!.componentInstance as CrmShell
  const settle = async () => {
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  return { ...state, harness, element, shell, settle }
}

afterEach(() => vi.restoreAllMocks())

describe("CrmShell", () => {
  it("renders the shared CRM navigation, four KPI cards in order and the routed consumer", async () => {
    const s = await mount()
    const nav = s.element.querySelector(
      'app-crm-catalog-navigation nav[aria-label="Catálogos CRM"]'
    )!
    expect(nav).not.toBeNull()
    expect([...nav.querySelectorAll("a")].map(link => link.textContent?.trim())).toEqual([
      "Clientes",
      "Prospectos",
      "Orígenes",
      "Etapas"
    ])
    expect(
      s.element
        .querySelector('app-crm-catalog-navigation [aria-current="page"]')
        ?.textContent?.trim()
    ).toBe("Clientes")
    const metrics = cards(s.element)
    expect(metrics.metrics.getAttribute("aria-label")).toBe("Resumen del CRM")
    expect(metrics.articles).toHaveLength(4)
    expect(metrics.labels).toEqual(["Clientes", "Prospectos", "Convertidos", "Pendientes"])
    expect(
      [...metrics.metrics.querySelectorAll(".kpi-tile")].map(tile =>
        tile.getAttribute("data-kpi-tone")
      )
    ).toEqual(["navy", "green", "amber", "blue"])
    expect(metrics.values()).toEqual(["—", "—", "—", "—"])
    expect(s.element.querySelector("router-outlet")).not.toBeNull()
    expect(s.element.querySelector("app-clientes-stub")).not.toBeNull()
    expect(s.element.querySelector("app-prospectos-stub")).toBeNull()
  })

  it("fills both card groups from their own statistics entries without local arithmetic", async () => {
    const s = await mount()
    await s.respondCustomers(Result.success(customerTotals))
    await s.respondLeads(Result.success(leadTotals))
    await s.settle()
    const metrics = cards(s.element)
    expect(metrics.values()).toEqual(["32", "45", "5", "40"])
    expect(metrics.description(0)).toBe("30 activos · 2 inactivos")
    expect(metrics.description(1)).toBe("5 convertidos · 40 pendientes")
    expect(metrics.description(2)).toBe("Del total del servidor")
    expect(metrics.description(3)).toBe("Del total del servidor")
    expect(s.element.querySelector("[data-customer-metric]")?.textContent?.trim()).toBe("32")
    expect(s.element.querySelector("[data-prospect-metric]")?.textContent?.trim()).toBe("45")
    expect(s.element.querySelector("[data-converted-metric]")?.textContent?.trim()).toBe("5")
    expect(s.element.querySelector("[data-pending-metric]")?.textContent?.trim()).toBe("40")
    expect(s.readCustomers).toHaveBeenCalledOnce()
    expect(s.readLeads).toHaveBeenCalledOnce()
  })

  it("surfaces unverified, stale and retryable errors per card group with one explicit retry", async () => {
    const s = await mount()
    expect(cards(s.element).description(0)).toBe("Cargando estadísticas…")
    await s.respondCustomers(Result.failure(new CustomerError("NETWORK")))
    await s.settle()
    expect(cards(s.element).values()[0]).toBe("—")
    expect(s.element.textContent).toContain("No se pudieron cargar las estadísticas de clientes.")
    expect(s.readCustomers).toHaveBeenCalledOnce()
    const retryCustomers = Array.from(s.element.querySelectorAll("button")).find(
      button => button.textContent?.trim() === "Reintentar estadísticas de clientes"
    )!
    expect(retryCustomers).toBeDefined()
    retryCustomers.click()
    await s.settle()
    expect(s.readCustomers).toHaveBeenCalledTimes(2)
    await s.respondCustomers(Result.success(customerTotals))
    await s.settle()
    expect(cards(s.element).values()[0]).toBe("32")
    expect(s.element.textContent).not.toContain(
      "No se pudieron cargar las estadísticas de clientes."
    )
    s.shell().retryCustomers()
    await s.settle()
    expect(cards(s.element).values()[0]).toBe("32")
    expect(s.element.textContent).toContain("Actualizando estadísticas…")
    await s.respondCustomers(Result.failure(new CustomerError("NETWORK")))
    await s.settle()
    expect(cards(s.element).values()[0]).toBe("32")
    expect(s.element.textContent).toContain("Las estadísticas pueden estar desactualizadas.")
    expect(s.element.textContent).not.toContain("Actualizando estadísticas…")
    await s.respondLeads(Result.failure(new CustomerError("NETWORK")))
    await s.settle()
    expect(cards(s.element).values()[1]).toBe("—")
    expect(s.element.textContent).toContain("No se pudieron cargar las estadísticas de prospectos.")
    const retryLeads = Array.from(s.element.querySelectorAll("button")).find(
      button => button.textContent?.trim() === "Reintentar estadísticas de prospectos"
    )!
    retryLeads.click()
    await s.settle()
    expect(s.readLeads).toHaveBeenCalledTimes(2)
    await s.respondLeads(Result.success(leadTotals))
    await s.settle()
    expect(cards(s.element).values().slice(1)).toEqual(["45", "5", "40"])
    expect(cards(s.element).description(1)).toBe("5 convertidos · 40 pendientes")
  })

  it("keeps the KPI block mounted and never re-reads it when switching CRM routes", async () => {
    const s = await mount()
    await s.respondCustomers(Result.success(customerTotals))
    await s.respondLeads(Result.success(leadTotals))
    await s.settle()
    const metrics = s.element.querySelector(".catalog-metrics")!
    const firstCard = metrics.firstElementChild
    expect(s.readCustomers).toHaveBeenCalledOnce()
    expect(s.readLeads).toHaveBeenCalledOnce()
    await s.harness.navigateByUrl("/admin/customers/leads")
    await s.settle()
    expect(s.element.querySelector("app-prospectos-stub")).not.toBeNull()
    expect(s.element.querySelector("app-clientes-stub")).toBeNull()
    expect(
      s.element
        .querySelector('app-crm-catalog-navigation [aria-current="page"]')
        ?.textContent?.trim()
    ).toBe("Prospectos")
    expect(s.element.querySelector(".catalog-metrics")).toBe(metrics)
    expect(metrics.firstElementChild).toBe(firstCard)
    expect(cards(s.element).values()).toEqual(["32", "45", "5", "40"])
    expect(s.readCustomers).toHaveBeenCalledOnce()
    expect(s.readLeads).toHaveBeenCalledOnce()
    await s.harness.navigateByUrl("/admin/customers")
    await s.settle()
    expect(s.element.querySelector("app-clientes-stub")).not.toBeNull()
    expect(s.element.querySelector(".catalog-metrics")).toBe(metrics)
    expect(metrics.firstElementChild).toBe(firstCard)
    expect(s.readCustomers).toHaveBeenCalledOnce()
    expect(s.readLeads).toHaveBeenCalledOnce()
  })

  it("clears and fences both statistics reads on session replacement, preserving renewal", async () => {
    const s = await mount()
    await s.respondCustomers(Result.success(customerTotals))
    await s.respondLeads(Result.success(leadTotals))
    await s.settle()
    const current = s.session.value!
    s.session.next(
      AuthSession.create(current.name, current.email, current.role, current.expiresAt, current.id)
    )
    await s.settle()
    expect(cards(s.element).values()).toEqual(["32", "45", "5", "40"])
    expect(s.readCustomers).toHaveBeenCalledOnce()
    expect(s.readLeads).toHaveBeenCalledOnce()
    s.shell().retryCustomers()
    await s.settle()
    const pending = s.customerRequests.at(-1)!
    expect(pending.observed).toBe(true)
    s.session.next(AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8))
    await s.settle()
    expect(pending.observed).toBe(false)
    expect(cards(s.element).values()).toEqual(["—", "—", "—", "—"])
  })

  it("does not dispatch statistics reads during SSR", () => {
    const state = configure(true)
    const fixture = TestBed.createComponent(CrmShell)
    fixture.detectChanges()
    expect(state.readCustomers).not.toHaveBeenCalled()
    expect(state.readLeads).not.toHaveBeenCalled()
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "Estadísticas sin verificar"
    )
    fixture.destroy()
  })
})
