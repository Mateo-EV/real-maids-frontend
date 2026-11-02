import { createEnvironmentInjector, EnvironmentInjector, getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { ViewService } from "@ngneat/overview"
import { HotToastService, provideHotToastConfig } from "@ngxpert/hot-toast"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appConfig } from "@/app/core/config/app.config"
import { CUSTOMERS_ROUTES } from "@/app/features/customers/customers.routes"
import { USERS_ROUTES } from "@/app/features/users/users.routes"
import { provideCatalogToast } from "./catalog-toast"

export function disposeCatalogToasts(): void {
  document.querySelectorAll("hot-toast-container").forEach(element => {
    const service = getDebugNode(element)?.injector.get(HotToastService)
    service?.close()
    ;(service as unknown as { _componentRef?: { destroy(): void } })?._componentRef?.destroy()
    element.remove()
  })
}

describe("lazy catalog notification ownership", () => {
  beforeEach(() =>
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
  )
  afterEach(() => {
    disposeCatalogToasts()
    vi.unstubAllGlobals()
  })

  for (const [name, routes] of [
    ["Users", USERS_ROUTES],
    ["CRM", CUSTOMERS_ROUTES]
  ] as const) {
    it(`${name} gives the actual body container its consumer service and non-default route config`, () => {
      TestBed.configureTestingModule({ providers: appConfig.providers })
      const root = TestBed.inject(EnvironmentInjector)
      const route = createEnvironmentInjector(
        [
          ...(routes[0].providers ?? []),
          provideHotToastConfig({ position: "bottom-right", duration: 1234 })
        ],
        root
      )
      try {
        const toast = route.get(HotToastService)
        expect(toast).not.toBe(root.get(HotToastService))
        expect(route.get(ViewService)).not.toBe(root.get(ViewService))
        toast.success(`${name} confirmed`)
        const container = document.body.querySelector("hot-toast-container")!
        expect(container.parentElement).toBe(document.body)
        const debug = getDebugNode(container)!
        expect(debug.injector.get(HotToastService)).toBe(toast)
        expect(debug.injector.get(ViewService)).toBe(route.get(ViewService))
        expect((debug.componentInstance as { defaultConfig(): unknown }).defaultConfig()).toBe(
          toast.defaultConfig
        )
        expect(toast.defaultConfig).toMatchObject({ position: "bottom-right", duration: 1234 })
      } finally {
        disposeCatalogToasts()
        route.destroy()
      }
    })
  }

  it("accepts optional route configuration without creating a root facade", () => {
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const route = createEnvironmentInjector(
      provideCatalogToast({ position: "bottom-left" }),
      TestBed.inject(EnvironmentInjector)
    )
    try {
      expect(route.get(HotToastService).defaultConfig.position).toBe("bottom-left")
    } finally {
      route.destroy()
    }
  })
})
