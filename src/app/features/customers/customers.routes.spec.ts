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
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            ...CUSTOMERS_ROUTES[0],
            path: "customers",
            canActivate: [],
            providers: [
              ...(CUSTOMERS_ROUTES[0].providers ?? []),
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
  it("owns protected lazy list and read-only detail routes without local store providers", async () => {
    expect(CUSTOMERS_ROUTES).toHaveLength(3)
    const leads = CUSTOMERS_ROUTES[1]
    expect(leads.path).toBe("leads")
    expect(leads.canActivate).toEqual([authGuard])
    expect(leads.providers).toBeDefined()
    const { LeadsPage } = await import("./presentation/pages/leads-page/leads-page")
    expect(await leads.loadComponent!()).toBe(LeadsPage)
    const detail = CUSTOMERS_ROUTES[2]
    expect(detail.path).toBe(":id")
    expect(detail.canActivate).toEqual([authGuard])
    expect(detail.providers).toBeDefined()
    const { CustomerDetailPage } =
      await import("./presentation/pages/customer-detail-page/customer-detail-page")
    expect(await detail.loadComponent!()).toBe(CustomerDetailPage)
    const route = CUSTOMERS_ROUTES[0]
    expect(route.path).toBe("")
    expect(route.canActivate).toEqual([authGuard])
    expect(route.title).toBe("Clientes | The Real Maids")
    expect(route.providers).toBeDefined()
    expect(await route.loadComponent!()).toBe(CustomersPage)
  })
})
