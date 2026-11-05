import { Dialog } from "@angular/cdk/dialog"
import { Location } from "@angular/common"
import { Component } from "@angular/core"
import { SpyLocation } from "@angular/common/testing"
import { HttpTestingController } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { NavigationEnd, Router } from "@angular/router"
import { filter, firstValueFrom, Subject, take } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  caller,
  detailUrl,
  properties,
  requestDto,
  requests,
  setupUpdate,
  types
} from "../../components/service-request-editor/service-request-update.testing"
import { ServiceRequestsHttpSource } from "../../../infrastructure/source/service-requests-http.source"

@Component({ selector: "app-history-dialog-probe", template: "<p>Unrelated dialog</p>" })
class HistoryDialogProbe {}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

// T5 S1/S3/S4 + L164: detail-only loaded-owner launcher and lifecycle tests.
// Existing detail read/return/SSR tests remain in the original spec unchanged
// apart from the explicit newly-supported Edit action and toast DI fixture.
describe("WP7 request detail additive edit ownership", () => {
  it.each(["atendida", "cancelada"])(
    "does not expose edit for a loaded %s request",
    async status => {
      const s = await setupUpdate()
      expect(s.button("Editar solicitud")).toBeUndefined()
      s.read().flush({ ...requestDto(), estado: status })
      await s.settle()
      expect(s.button("Editar solicitud")).toBeUndefined()
      expect(s.editor()).toBeNull()
      s.http.expectNone(() => true)
    }
  )

  it("exposes only the registered matching loaded request action in catalogControls and keeps one overlay", async () => {
    const s = await setupUpdate()
    expect(s.button("Editar solicitud")).toBeUndefined()
    s.read().flush({ ...requestDto(), idSolicitud: 18 })
    await s.settle()
    expect(s.button("Editar solicitud")).toBeUndefined()
    await s.click("Reintentar")
    s.read().flush(requestDto())
    await s.settle()
    const controls = s.root().querySelector("[catalogControls]")
    expect(controls?.textContent).toContain("Editar solicitud")
    expect(s.root().textContent).not.toMatch(/Cancelar solicitud|Crear orden|Cotizar/i)
    await s.open()
    // Double activation must not mount duplicate editors/read the catalogs twice.
    s.button("Editar solicitud")?.click()
    await s.settle()
    expect(document.querySelectorAll("app-service-request-editor")).toHaveLength(1)
    await s.choices()
    s.http.expectNone(() => true)
  })

  it("keeps the same overlay/draft and read on query-only return-context changes and same-session renewal", async () => {
    const s = await setupUpdate({ url: `${detailUrl}?page=2&size=5` })
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    await s.choices()
    const editor = s.dialog()
    await s.fill("description", "Borrador vivo")
    await s.navigate(`${detailUrl}?page=4&size=10`)
    s.session.next(caller(19, "Renewed"))
    await s.settle()
    expect(s.dialog()).toBe(editor)
    expect(s.field("description").value).toBe("Borrador vivo")
    expect(s.root().querySelector("a[href]")?.getAttribute("href")).toBe(
      "/admin/operations/requests?page=4&size=10"
    )
    s.http.expectNone(() => true)
    await s.submit()
    const update = s.put()
    s.session.next(caller(19, "Renewed again"))
    await s.settle()
    expect(update.cancelled).toBe(false)
    update.flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(s.field("description").value).toBe("Borrador vivo")
    expect(s.success).not.toHaveBeenCalled()
  })

  it("preserves a pending editor on same-owner history changes but cancels on another request history entry", async () => {
    const s = await setupUpdate({ browserHistory: true })
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    await s.choices()
    await s.fill("description", "Borrador de historial")
    const editor = s.dialog()
    await s.submit()
    const update = s.put()
    const location = TestBed.inject(Location) as SpyLocation
    const historyNavigate = async (url: string) => {
      const completed = firstValueFrom(
        TestBed.inject(Router).events.pipe(
          filter(event => event instanceof NavigationEnd),
          take(1)
        )
      )
      location.simulateUrlPop(url)
      await completed
      await s.settle()
    }
    // The root dialog keeps its default history dismissal policy.
    TestBed.inject(Dialog).open(HistoryDialogProbe)
    expect(document.querySelector("app-history-dialog-probe")).not.toBeNull()
    await historyNavigate(`${detailUrl}?page=4&size=10`)
    expect(s.editor()).toBe(editor)
    expect(document.querySelector("app-history-dialog-probe")).toBeNull()
    expect(update.cancelled).toBe(false)
    expect(s.field("description").value).toBe("Borrador de historial")
    expect(s.root().querySelector("a[href]")?.getAttribute("href")).toBe(
      "/admin/operations/requests?page=4&size=10"
    )
    expect(s.store.writing()).toBe(true)
    expect(s.success).not.toHaveBeenCalled()
    expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
    await historyNavigate("/admin/operations/requests/18")
    expect(update.cancelled).toBe(true)
    expect(s.editor()).toBeNull()
    expect(s.store.writing()).toBe(false)
    s.read(18).flush(requestDto(18))
    await s.settle()
    expect(s.success).not.toHaveBeenCalled()
    expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
  })

  it.each(["owner", "navigate", "destroy", "replacement", "deadline", "logout"] as const)(
    "cancels/fences pending editor PUT on %s without changing root lifetime",
    async action => {
      const s = await setupUpdate()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.choices()
      await s.submit()
      const update = s.put()
      if (action === "owner") await s.navigate("/admin/operations/requests/18")
      else if (action === "navigate") await s.navigate("/away")
      else if (action === "destroy") s.harness.fixture.destroy()
      else
        s.session.next(
          action === "logout"
            ? null
            : action === "deadline"
              ? caller(19, "Deadline changed", 4102444800001)
              : caller(20)
        )
      if (action !== "destroy") await s.settle()
      expect(update.cancelled).toBe(true)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
      expect(s.store.writing()).toBe(false)
      if (action === "owner") {
        s.read(18).flush({ ...requestDto(18), cliente: "Nuevo dueño de vista" })
        await s.settle()
        expect(s.root().textContent).toContain("Nuevo dueño de vista")
        // Request identity changed, but its customer (8) did not. Fresh owner
        // properties/types survive a cancelled PUT and are reused on reopening.
        await s.open()
        expect(s.field("propertyId").value).toBe("31")
        expect(s.field("serviceTypeId").value).toBe("4")
      }
      s.http.expectNone(() => true)
    }
  )

  it("cancels old editor catalogs synchronously before starting the replacement owner read", async () => {
    const s = await setupUpdate()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    const oldProperties = s.http.expectOne(properties),
      oldTypes = s.http.expectOne(types)
    // Observe the existing public transport call at dispatch, not merely after
    // eventual DOM destruction. No private component/store fields are read.
    const order: boolean[] = []
    const transport = TestBed.inject(ServiceRequestsHttpSource)
    const original = transport.getRequest.bind(transport)
    vi.spyOn(transport, "getRequest").mockImplementation(id => {
      if (id === 18) order.push(oldProperties.cancelled && oldTypes.cancelled)
      return original(id)
    })
    await s.navigate("/admin/operations/requests/18")
    expect(order).toEqual([true])
    expect(oldProperties.cancelled).toBe(true)
    expect(oldTypes.cancelled).toBe(true)
    s.read(18).flush(requestDto(18))
    await s.settle()
    expect(s.success).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
  })

  it.each(["logout", "query-only"] as const)(
    "fences post-await feedback for %s while preserving query-only success",
    async action => {
      const s = await setupUpdate()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.choices()
      await s.submit()
      s.put().flush(requestDto())
      // Deliberately no await between Result delivery and invalidation/navigation.
      if (action === "logout") s.session.next(null)
      else await s.navigate(`${detailUrl}?page=3&size=5`)
      await s.settle()
      expect(s.success).toHaveBeenCalledTimes(action === "query-only" ? 1 : 0)
      const oldReads = s.http.match(r => r.url === `${requests}/17` && r.method === "GET")
      expect(oldReads).toHaveLength(1)
      if (action === "query-only") oldReads[0].flush(requestDto())
      else oldReads.forEach(read => expect(read.cancelled).toBe(true))
      await s.settle()
      s.http.expectNone(() => true)
    }
  )

  it.each(["escape", "outside", "cancel"] as const)(
    "allows idle %s dismissal but detached closing-animation forms cannot save",
    async action => {
      const s = await setupUpdate()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.choices()
      const editor = s.dialog(),
        overlay = s.overlay()
      if (action === "cancel") s.button("Cancelar", editor)!.click()
      else if (action === "escape")
        (overlay.keydownEvents() as Subject<KeyboardEvent>).next(
          new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
        )
      else (overlay.outsidePointerEvents() as Subject<MouseEvent>).next(new MouseEvent("click"))
      editor
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await s.settle()
      expect(overlay.hasAttached()).toBe(false)
      expect(s.store.writing()).toBe(false)
      expect(s.success).not.toHaveBeenCalled()
      s.http.expectNone(() => true)
    }
  )

  it.each([{ server: true }, { guest: true }, { url: "/admin/operations/requests/0" }])(
    "never exposes an editor or catalogs for unavailable context %j",
    async options => {
      const s = await setupUpdate(options)
      s.button("Editar solicitud")?.click()
      await s.settle()
      expect(s.editor()).toBeNull()
      expect(s.success).not.toHaveBeenCalled()
      s.http.expectNone(() => true)
      if ("server" in options) {
        expect(s.authFactory).not.toHaveBeenCalled()
        expect(s.observeSession).not.toHaveBeenCalled()
      }
    }
  )
})
