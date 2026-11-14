import { Component } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { describe, expect, it } from "vitest"
import { OperationsSectionNavigation } from "./operations-section-navigation"

@Component({
  imports: [OperationsSectionNavigation],
  template: "<app-operations-section-navigation />"
})
class OperationsDestination {}

describe("OperationsSectionNavigation", () => {
  it("exposes the three real route tabs with exactly one active page, ignoring paging query params", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: "admin/operations/requests", component: OperationsDestination },
          { path: "admin/operations/requests/:id", component: OperationsDestination },
          { path: "admin/operations/orders", component: OperationsDestination },
          { path: "admin/operations/orders/:id", component: OperationsDestination },
          { path: "admin/operations/agenda", component: OperationsDestination }
        ])
      ]
    })
    const harness = await RouterTestingHarness.create("/admin/operations/requests?page=2&size=20")
    const nav = () =>
      harness.routeNativeElement!.querySelector('nav[aria-label="Secciones de operaciones"]')!
    const links = () => [...nav().querySelectorAll<HTMLAnchorElement>("a")]
    expect(links().map(link => link.textContent?.trim())).toEqual([
      "Solicitudes",
      "Órdenes",
      "Agenda"
    ])
    expect(links().map(link => link.getAttribute("href"))).toEqual([
      "/admin/operations/requests",
      "/admin/operations/orders",
      "/admin/operations/agenda"
    ])
    expect(links().every(link => link.tabIndex === 0)).toBe(true)
    expect(nav().querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(nav().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe("Solicitudes")
    expect(nav().querySelector("button, [role=tab]")).toBeNull()
    for (const [href, label] of [
      ["/admin/operations/orders", "Órdenes"],
      ["/admin/operations/agenda", "Agenda"],
      ["/admin/operations/requests", "Solicitudes"]
    ] as const) {
      nav().querySelector<HTMLAnchorElement>(`a[href="${href}"]`)!.click()
      await harness.fixture.whenStable()
      harness.detectChanges()
      expect(nav().querySelectorAll('[aria-current="page"]')).toHaveLength(1)
      expect(nav().querySelector('[aria-current="page"]')?.textContent?.trim()).toBe(label)
    }
  })

  it("keeps the section tab active on its nested detail routes", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: "admin/operations/requests", component: OperationsDestination },
          { path: "admin/operations/requests/:id", component: OperationsDestination },
          { path: "admin/operations/orders", component: OperationsDestination },
          { path: "admin/operations/orders/:id", component: OperationsDestination },
          { path: "admin/operations/agenda", component: OperationsDestination }
        ])
      ]
    })
    const harness = await RouterTestingHarness.create("/admin/operations/requests/17?page=2&size=5")
    const nav = () =>
      harness.routeNativeElement!.querySelector('nav[aria-label="Secciones de operaciones"]')!
    const assertActive = (url: string, label: string) => {
      expect(nav().querySelectorAll('[aria-current="page"]'), url).toHaveLength(1)
      expect(nav().querySelector('[aria-current="page"]')?.textContent?.trim(), url).toBe(label)
    }
    assertActive("/admin/operations/requests/17?page=2&size=5", "Solicitudes")
    await harness.navigateByUrl("/admin/operations/orders/17?page=0&size=5")
    harness.detectChanges()
    assertActive("/admin/operations/orders/17?page=0&size=5", "Órdenes")
  })
})
