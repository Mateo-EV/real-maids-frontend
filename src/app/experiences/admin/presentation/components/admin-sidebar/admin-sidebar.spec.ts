import { Component } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { By } from "@angular/platform-browser"
import { NgIcon } from "@ng-icons/core"
import { provideRouter, Router } from "@angular/router"
import { HlmSidebarService } from "@spartan-ng/helm/sidebar"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AdminSidebar } from "./admin-sidebar"

@Component({ template: "" })
class Destination {}

afterEach(() => vi.unstubAllGlobals())

describe("AdminSidebar CRM navigation", () => {
  it("retains the exact CRM label, placement and icon, and preserves IAM", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    TestBed.configureTestingModule({
      imports: [AdminSidebar],
      providers: [
        HlmSidebarService,
        provideRouter([
          { path: "admin/customers", component: Destination },
          { path: "admin/users", component: Destination }
        ])
      ]
    })
    const fixture = TestBed.createComponent(AdminSidebar)
    fixture.detectChanges()
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    const general = element.querySelector('[role="group"][aria-label="General"]')!
    expect(Array.from(general.querySelectorAll("li"), item => item.textContent?.trim())).toEqual([
      "Landing",
      "CRM",
      "RRHH",
      "Cotizaciones",
      "Programaciones"
    ])
    const crm = general.querySelector<HTMLAnchorElement>('a[href="/admin/customers"]')!
    expect(crm?.textContent?.trim()).toBe("CRM")
    const icon = fixture.debugElement
      .queryAll(By.directive(NgIcon))
      .find(node => crm.contains(node.nativeElement))!
    expect((icon.componentInstance as NgIcon).name()).toBe("lucideContactRound")
    await TestBed.inject(Router).navigateByUrl("/admin/customers")
    fixture.detectChanges()
    expect(crm.getAttribute("aria-current")).toBe("page")
    const iam = element.querySelector<HTMLAnchorElement>('a[href="/admin/users"]')!
    expect(iam.textContent?.trim()).toBe("IAM")
    await TestBed.inject(Router).navigateByUrl("/admin/users")
    fixture.detectChanges()
    expect(iam.getAttribute("aria-current")).toBe("page")
    expect(crm.hasAttribute("aria-current")).toBe(false)
    expect(general.querySelectorAll("button[disabled]")).toHaveLength(4)
  })
})
