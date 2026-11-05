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

// WP7 T4 / S1,S3: RRHH navigation with the historical CRM contract preserved below.
describe("AdminSidebar RRHH navigation", () => {
  it("links RRHH in its existing General position and keeps it active for staff descendants without changing IAM, CRM or unavailable modules", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    )
    TestBed.configureTestingModule({
      imports: [AdminSidebar],
      providers: [
        HlmSidebarService,
        provideRouter([
          { path: "admin/staff", component: Destination },
          { path: "admin/staff/me", component: Destination },
          { path: "admin/staff/:id", component: Destination },
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
    const administration = element.querySelector('[role="group"][aria-label="Administración"]')!
    const rrhh = general.querySelector<HTMLAnchorElement>('a[href="/admin/staff"]')
    // The intended first failure is the absent public link, not a null dereference.
    expect(rrhh, "Missing RRHH anchor to /admin/staff").not.toBeNull()
    expect(rrhh!.textContent?.trim()).toBe("RRHH")
    expect(rrhh!.classList.contains("module-button")).toBe(true)
    expect(Array.from(general.querySelectorAll("li"), item => item.textContent?.trim())).toEqual([
      "Landing",
      "CRM",
      "RRHH",
      "Operaciones",
      "Cotizaciones",
      "Programaciones"
    ])
    const icon = fixture.debugElement
      .queryAll(By.directive(NgIcon))
      .find(node => rrhh!.contains(node.nativeElement))!
    expect((icon.componentInstance as NgIcon).name()).toBe("lucideUsersRound")
    expect(icon.nativeElement.getAttribute("aria-hidden")).toBe("true")
    const crm = general.querySelector<HTMLAnchorElement>('a[href="/admin/customers"]')!
    const iam = administration.querySelector<HTMLAnchorElement>('a[href="/admin/users"]')!
    expect(crm.textContent?.trim()).toBe("CRM")
    expect(iam.textContent?.trim()).toBe("IAM")
    expect(element.querySelectorAll("nav a")).toHaveLength(4)
    const router = TestBed.inject(Router)
    rrhh!.click()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(router.url).toBe("/admin/staff")
    for (const url of ["/admin/staff", "/admin/staff/me", "/admin/staff/7"]) {
      await router.navigateByUrl(url)
      await fixture.whenStable()
      fixture.detectChanges()
      expect(rrhh!.getAttribute("aria-current")).toBe("page")
      expect(rrhh!.querySelector('.active-dot[aria-hidden="true"]')).not.toBeNull()
      expect(crm.hasAttribute("aria-current")).toBe(false)
      expect(iam.hasAttribute("aria-current")).toBe(false)
    }
    for (const [url, active] of [
      ["/admin/users", iam],
      ["/admin/customers", crm]
    ] as const) {
      await router.navigateByUrl(url)
      await fixture.whenStable()
      fixture.detectChanges()
      expect(active.getAttribute("aria-current")).toBe("page")
      expect(rrhh!.hasAttribute("aria-current")).toBe(false)
    }
    expect(general.querySelectorAll("button[disabled]")).toHaveLength(3)
    for (const label of ["Landing", "Cotizaciones", "Programaciones"]) {
      const button = Array.from(general.querySelectorAll<HTMLButtonElement>("button")).find(
        item => item.textContent?.trim() === label
      )
      expect(button, label).toBeDefined()
      expect(button!.disabled).toBe(true)
      expect(button!.hasAttribute("routerLink")).toBe(false)
      expect(button!.hasAttribute("href")).toBe(false)
      expect(
        Array.from(general.querySelectorAll("a")).some(link => link.textContent?.trim() === label)
      ).toBe(false)
      button!.click()
      await fixture.whenStable()
      expect(router.url).toBe("/admin/customers")
    }
  })
})

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
      "Operaciones",
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
    expect(general.querySelectorAll("button[disabled]")).toHaveLength(3)
  })
})

describe("AdminSidebar approved Operations navigation", () => {
  it("adds Operaciones without repurposing existing module labels and marks its request descendants active", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    )
    TestBed.configureTestingModule({
      imports: [AdminSidebar],
      providers: [
        HlmSidebarService,
        provideRouter([
          { path: "admin/operations", pathMatch: "full", redirectTo: "/admin/operations/requests" },
          { path: "admin/operations/requests", component: Destination },
          { path: "admin/operations/requests/:id", component: Destination },
          { path: "admin/users", component: Destination },
          { path: "admin/customers", component: Destination },
          { path: "admin/staff", component: Destination }
        ])
      ]
    })
    const fixture = TestBed.createComponent(AdminSidebar)
    fixture.detectChanges()
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    const link = element.querySelector<HTMLAnchorElement>('a[href="/admin/operations"]')
    expect(link, "Missing approved Operaciones link").not.toBeNull()
    expect(link!.textContent?.trim()).toBe("Operaciones")
    expect(link!.querySelector('ng-icon[aria-hidden="true"]')).not.toBeNull()
    const router = TestBed.inject(Router)
    link!.click()
    await fixture.whenStable()
    expect(router.url).toBe("/admin/operations/requests")
    for (const url of ["/admin/operations/requests", "/admin/operations/requests/17"]) {
      await router.navigateByUrl(url)
      await fixture.whenStable()
      fixture.detectChanges()
      expect(link!.getAttribute("aria-current")).toBe("page")
      for (const old of ["/admin/users", "/admin/customers", "/admin/staff"])
        expect(element.querySelector(`a[href="${old}"]`)!.hasAttribute("aria-current")).toBe(false)
    }
    for (const label of ["Landing", "Cotizaciones", "Programaciones"]) {
      const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(
        button => button.textContent?.trim() === label
      )!
      expect(button.disabled).toBe(true)
      button.click()
      await fixture.whenStable()
      expect(router.url).toBe("/admin/operations/requests/17")
    }
  })
})
