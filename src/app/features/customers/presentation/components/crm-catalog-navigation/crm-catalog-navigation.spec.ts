import { Component } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { describe, expect, it } from "vitest"
import { CrmCatalogNavigation } from "./crm-catalog-navigation"

@Component({ imports: [CrmCatalogNavigation], template: "<app-crm-catalog-navigation />" })
class CatalogDestination {}

describe("CrmCatalogNavigation", () => {
  it("uses real keyboard-focusable links with exactly one active page, ignoring paging query params", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: "admin/customers", component: CatalogDestination },
          { path: "admin/customers/leads", component: CatalogDestination },
          { path: "admin/customers/origins", component: CatalogDestination },
          { path: "admin/customers/stages", component: CatalogDestination }
        ])
      ]
    })
    const harness = await RouterTestingHarness.create("/admin/customers?offset=20&limit=20")
    const nav = () => harness.routeNativeElement!.querySelector('nav[aria-label="Catálogos CRM"]')!
    expect(nav().querySelectorAll("a")).toHaveLength(4)
    expect([...nav().querySelectorAll("a")].map(link => link.textContent?.trim())).toEqual([
      "Clientes",
      "Prospectos",
      "Orígenes",
      "Etapas"
    ])
    expect(nav().querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    const clients = nav().querySelector<HTMLAnchorElement>('a[href="/admin/customers"]')!
    expect(clients.textContent?.trim()).toBe("Clientes")
    expect(clients.getAttribute("aria-current")).toBe("page")
    const leads = nav().querySelector<HTMLAnchorElement>('a[href="/admin/customers/leads"]')!
    expect(leads.textContent?.trim()).toBe("Prospectos")
    expect(leads.tabIndex).toBe(0)
    const origins = nav().querySelector<HTMLAnchorElement>('a[href="/admin/customers/origins"]')!
    const stages = nav().querySelector<HTMLAnchorElement>('a[href="/admin/customers/stages"]')!
    expect(origins.textContent?.trim()).toBe("Orígenes")
    expect(stages.textContent?.trim()).toBe("Etapas")
    expect(origins.tabIndex).toBe(0)
    expect(stages.tabIndex).toBe(0)
    const link = (href: string) => nav().querySelector<HTMLAnchorElement>(`a[href="${href}"]`)!
    link("/admin/customers/leads").click()
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(nav().querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(nav().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe("Prospectos")
    link("/admin/customers/origins").click()
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(nav().querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(nav().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe("Orígenes")
    link("/admin/customers/stages").click()
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(nav().querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(nav().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe("Etapas")
    expect(nav().querySelector("button, [role=tab]")).toBeNull()
  })
})
