import { afterEach, describe, expect, it, vi } from "vitest"
import { getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, of } from "rxjs"
import { HotToastService, provideHotToastConfig } from "@ngxpert/hot-toast"
import { ViewService } from "@ngneat/overview"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { ListCustomersUseCase } from "./application/use-cases/list-customers.use-case"
import { CustomerEditorContext } from "./presentation/components/customer-editor/customer-editor"

afterEach(() => {
  document.querySelectorAll("hot-toast-container").forEach(element => {
    const service = getDebugNode(element)?.injector.get(HotToastService)
    service?.close()
    ;(service as unknown as { _componentRef?: { destroy(): void } })?._componentRef?.destroy()
    element.remove()
  })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { CUSTOMERS_ROUTES } from "./customers.routes"
import { CustomersPage } from "./presentation/pages/customers-page/customers-page"

describe("Customer feature routes", () => {
  it("delivers page callbacks through the route service into its configured body container", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    const session = new BehaviorSubject(
      AuthSession.create("Test", "identity@example.test", null, Date.now() + 600000, 7)
    )
    const listRoute = CUSTOMERS_ROUTES[0].children!.find(route => route.path === "")!
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            ...listRoute,
            path: "customers",
            canActivate: [],
            providers: [
              ...(listRoute.providers ?? []),
              provideHotToastConfig({ position: "bottom-right" })
            ]
          }
        ]),
        { provide: AuthStore, useValue: { session: () => session.value } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
        {
          provide: ListCustomersUseCase,
          useValue: {
            execute: () => of(Result.success({ items: [], total: 0, offset: 0, limit: 20 }))
          }
        }
      ]
    })
    const harness = await RouterTestingHarness.create()
    const page = await harness.navigateByUrl("/customers", CustomersPage)
    harness.detectChanges()
    const debug = harness.routeDebugElement!
    const toast = debug.injector.get(HotToastService)
    const success = vi.spyOn(toast, "success")
    const open = vi.spyOn(debug.injector.get(HlmDialogService), "open")
    page.edit()
    const context = open.mock.calls[0][1]!.context as CustomerEditorContext
    context.onSaved()
    expect(success).toHaveBeenCalledExactlyOnceWith("Cliente creado correctamente.")
    const container = document.body.querySelector("hot-toast-container")!
    expect(container.parentElement).toBe(document.body)
    expect(getDebugNode(container)!.injector.get(HotToastService)).toBe(toast)
    expect(getDebugNode(container)!.injector.get(ViewService)).toBe(debug.injector.get(ViewService))
    expect(toast.defaultConfig.position).toBe("bottom-right")
    expect(harness.routeNativeElement!.textContent).not.toContain("Cliente creado correctamente")
    open.mock.results[0].value.close()
  })
  it("composes one protected CRM shell whose children keep every page, guard and toast scope", async () => {
    expect(CUSTOMERS_ROUTES).toHaveLength(1)
    const shell = CUSTOMERS_ROUTES[0]
    expect(shell.path).toBe("")
    expect(shell.canActivate).toEqual([authGuard])
    const { CrmShell } = await import("./presentation/pages/crm-shell/crm-shell")
    expect(await shell.loadComponent!()).toBe(CrmShell)
    const children = shell.children!
    // Static paths stay before the dynamic customer detail; order is part of the contract.
    expect(children.map(route => route.path)).toEqual([
      "",
      "leads",
      "leads/:id",
      "origins",
      "stages",
      ":id"
    ])
    const [list, leads, leadDetail, origins, stages, detail] = children
    for (const child of children) expect(child.providers).toBeDefined()
    expect(list.title).toBe("Clientes | The Real Maids")
    expect(await list.loadComponent!()).toBe(CustomersPage)
    const { LeadsPage } = await import("./presentation/pages/leads-page/leads-page")
    expect(leads.title).toBe("Prospectos | The Real Maids")
    expect(await leads.loadComponent!()).toBe(LeadsPage)
    const { LeadDetailPage } =
      await import("./presentation/pages/lead-detail-page/lead-detail-page")
    expect(leadDetail.title).toBe("Detalle del prospecto | The Real Maids")
    expect(await leadDetail.loadComponent!()).toBe(LeadDetailPage)
    const { CrmOriginsPage } =
      await import("./presentation/pages/crm-origins-page/crm-origins-page")
    expect(origins.title).toBe("Orígenes de prospecto | The Real Maids")
    expect(await origins.loadComponent!()).toBe(CrmOriginsPage)
    const { CrmStagesPage } = await import("./presentation/pages/crm-stages-page/crm-stages-page")
    expect(stages.title).toBe("Etapas del embudo | The Real Maids")
    expect(await stages.loadComponent!()).toBe(CrmStagesPage)
    const { CustomerDetailPage } =
      await import("./presentation/pages/customer-detail-page/customer-detail-page")
    expect(detail.title).toBe("Detalle del cliente | The Real Maids")
    expect(await detail.loadComponent!()).toBe(CustomerDetailPage)
  })
})
