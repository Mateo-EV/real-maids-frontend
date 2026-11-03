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
          { path: "admin/customers/leads", component: CatalogDestination }
        ])
      ]
    })
    const harness = await RouterTestingHarness.create("/admin/customers?offset=20&limit=20")
    const nav = () => harness.routeNativeElement!.querySelector('nav[aria-label="Catálogos CRM"]')!
    expect(nav().querySelectorAll("a")).toHaveLength(2)
    expect(nav().querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    const clients = nav().querySelector<HTMLAnchorElement>('a[href="/admin/customers"]')!
    expect(clients.textContent?.trim()).toBe("Clientes")
    expect(clients.getAttribute("aria-current")).toBe("page")
    const leads = nav().querySelector<HTMLAnchorElement>('a[href="/admin/customers/leads"]')!
    expect(leads.textContent?.trim()).toBe("Prospectos")
    expect(leads.tabIndex).toBe(0)
    leads.click()
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(nav().querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(nav().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe("Prospectos")
    expect(nav().querySelector("button, [role=tab]")).toBeNull()
  })
})
