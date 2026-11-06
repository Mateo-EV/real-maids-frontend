import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { afterEach, describe, expect, it } from "vitest"
import {
  caller,
  detailUrl,
  requestDto,
  requests,
  setupUpdate
} from "../../components/service-request-editor/service-request-update.testing"

// Keep HTTP verification through the public controller, never internal registries.
import { HttpTestingController } from "@angular/common/http/testing"
afterEach(() => TestBed.inject(HttpTestingController).verify())

async function setup(options: Parameters<typeof setupUpdate>[0] = {}) {
  const s = await setupUpdate(options)
  const dialog = () => document.querySelector<HTMLElement>("app-service-request-cancel-dialog")
  const control = (name: string, root: ParentNode = s.root()) =>
    [...root.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === name
    )
  const click = async (name: string, root: ParentNode = s.root()) => {
    const button = control(name, root)
    expect(button, name).toBeDefined()
    expect(button!.disabled).toBe(false)
    button!.click()
    await s.settle()
  }
  const open = async () => {
    await click("Cancelar solicitud")
    expect(dialog()).not.toBeNull()
  }
  const reason = () => dialog()!.querySelector<HTMLTextAreaElement>("#request-cancel-reason")!
  const fill = async (text: string) => {
    reason().value = text
    reason().dispatchEvent(new Event("input", { bubbles: true }))
    reason().dispatchEvent(new Event("blur"))
    await s.settle()
  }
  const submit = async () => {
    dialog()!
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await s.settle()
  }
  const post = () =>
    s.http.expectOne(r => r.url === requests + "/17/cancelacion" && r.method === "POST")
  const overlay = () => getDebugNode(dialog()!)!.injector.get(CdkDialogRef).overlayRef
  return { ...s, dialog, control, click, open, reason, fill, submit, post, overlay }
}

describe("registered request explicit cancellation confirmation", () => {
  it("captures safe request/customer identity and explicit irreversible confirmation without extra lookups or early write", async () => {
    const s = await setup()
    expect(s.control("Cancelar solicitud")).toBeUndefined()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    expect(s.dialog()!.textContent).toContain("17")
    expect(s.dialog()!.textContent).toContain("Cliente capturado")
    expect(s.dialog()!.textContent).toMatch(/irreversible/i)
    expect(s.reason().value).toBe("")
    expect(s.dialog()!.querySelector('label[for="request-cancel-reason"]')).not.toBeNull()
    expect(s.dialog()!.className).not.toContain("SYNTHETIC-ACCESS")
    s.http.expectNone(() => true)
    await s.click("Cancelar", s.dialog()!)
    expect(s.dialog()).toBeNull()
    expect(s.success).not.toHaveBeenCalled()
    expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
  })

  it.each(["atendida", "cancelada"])(
    "does not offer cancellation for a loaded %s request",
    async status => {
      const s = await setup()
      s.read().flush({ ...requestDto(), estado: status })
      await s.settle()
      expect(s.control("Cancelar solicitud")).toBeUndefined()
      s.http.expectNone(() => true)
    }
  )

  it.each(["", "   ", "x".repeat(251)])(
    "blocks invalid trimmed reason without write or feedback: %s",
    async text => {
      const s = await setup()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.fill(text)
      await s.submit()
      expect(s.dialog()).not.toBeNull()
      expect(s.dialog()!.textContent).toMatch(/motivo|250/i)
      expect(s.store.writing()).toBe(false)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
      s.http.expectNone(() => true)
    }
  )

  it("trims 250 valid characters, keeps pending confirmation on query navigation, blocks dismissal and refreshes only once on success", async () => {
    const s = await setup()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    const reason = "x".repeat(250)
    await s.fill("  " + reason + "  ")
    await s.submit()
    const request = s.post()
    expect(request.request.body).toEqual({ motivo: reason })
    expect(s.dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(
      true
    )
    expect(s.control("Cancelar", s.dialog()!)!.disabled).toBe(true)
    await s.submit()
    s.overlay().backdropElement!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await s.navigate(detailUrl + "?page=4&size=10")
    expect(request.cancelled).toBe(false)
    expect(s.reason().value).toBe("  " + reason + "  ")
    expect(s.root().querySelector("a")!.getAttribute("href")).toBe(
      "/admin/operations/requests?page=4&size=10"
    )
    expect(s.success).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
    request.flush({ ...requestDto(), estado: "cancelada" })
    await s.settle()
    expect(s.dialog()).toBeNull()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Solicitud cancelada correctamente.")
    expect(s.history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    s.read().flush({ ...requestDto(), estado: "cancelada" })
    await s.settle()
    expect(s.control("Cancelar solicitud")).toBeUndefined()
    expect(s.control("Editar solicitud")).toBeUndefined()
    s.http.expectNone(() => true)
  })

  it.each([403, 409, 0])(
    "retains draft with safe actionable failure %s and does not replay",
    async status => {
      const s = await setup()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.fill("Motivo escrito")
      await s.submit()
      const request = s.post()
      if (!status) request.error(new ProgressEvent("error"))
      else request.flush({ mensaje: "RAW-SENSITIVE" }, { status, statusText: "Failure" })
      await s.settle()
      expect(s.reason().value).toBe("Motivo escrito")
      expect(s.dialog()!.querySelector('[role="alert"]')).not.toBeNull()
      expect(s.dialog()!.textContent).not.toContain("RAW-SENSITIVE")
      if (!status) expect(s.dialog()!.textContent).toMatch(/consulta|verifica/i)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
      s.http.expectNone(() => true)
    }
  )

  it.each(["owner", "navigate", "destroy", "replacement", "logout"] as const)(
    "cancels and fences a pending confirmation on %s",
    async action => {
      const s = await setup()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.fill("Motivo")
      await s.submit()
      const request = s.post()
      if (action === "owner") await s.navigate("/admin/operations/requests/18")
      else if (action === "navigate") await s.navigate("/away")
      else if (action === "destroy") s.harness.fixture.destroy()
      else s.session.next(action === "logout" ? null : caller(20))
      if (action !== "destroy") await s.settle()
      expect(request.cancelled).toBe(true)
      expect(s.store.writing()).toBe(false)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
      if (action === "owner") {
        s.read(18).flush(requestDto(18))
        await s.settle()
      }
      s.http.expectNone(() => true)
    }
  )
})
