import { HttpTestingController } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { afterEach, describe, expect, it, vi } from "vitest"
import { detailDto, requestsUrl, setupSupportWrites } from "../support-write.testing"

const stateDialog = "app-support-state-dialog"
const detailRead = `${requestsUrl}/17`
const stateWrite = `${requestsUrl}/17/estado`

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

/**
 * WP8 T8 / S5, S6, S11: the state consumer sends the chosen documented code and reports
 * the server's answer. The transition table is the backend's authority, so nothing here
 * predicts it: only the current state is left out of the offered targets.
 */
describe("Support state consumer", () => {
  async function detail(state = "RECIBIDA") {
    const s = await setupSupportWrites("/admin/support/17")
    s.http.expectOne(detailRead).flush(detailDto(17, { estado: state, estadoNombre: state }))
    await s.settle()
    return s
  }

  async function open(s: Awaited<ReturnType<typeof detail>>) {
    await s.click("Cambiar estado")
    const element = s.dialog(stateDialog)
    expect(element, "State dialog must be mounted").not.toBeNull()
    return element!
  }

  const targets = (element: HTMLElement) =>
    Array.from(element.querySelector<HTMLSelectElement>("#support-state-target")!.options).map(
      option => [option.value, option.textContent?.trim()]
    )

  it.each([
    ["RECIBIDA", ["EN_REVISION", "RESUELTA", "CERRADA"]],
    ["EN_REVISION", ["RESUELTA", "CERRADA"]]
  ])(
    "offers the documented targets for a %s request and excludes the current state",
    async (state, expected) => {
      const s = await detail(state)
      const element = await open(s)
      // S4/S5: the closed backend vocabulary, minus the state the record already has.
      expect(targets(element).map(([value]) => value)).toEqual(["", ...expected])
      expect(element.textContent).not.toMatch(/final|prohibid|no permitid/i)
      // Opening an already verified detail dispatches no read.
      s.http.expectNone(() => true)
    }
  )

  it("sends the chosen code with the trimmed optional message and confirms with one toast", async () => {
    const s = await detail()
    const element = await open(s)
    await s.fill("#support-state-target", "RESUELTA", "change", element)
    await s.fill("#support-state-message", "  Se respondió por correo  ", "input", element)
    await s.submit(element)

    const patches = s.patches()
    expect(patches).toHaveLength(1)
    const [patch] = patches
    expect(patch.request.url).toBe(stateWrite)
    expect(patch.request.transferCache).toBe(false)
    // The chosen code travels unchanged; the client never pre-validates the transition.
    expect(patch.request.body).toEqual({
      estado: "RESUELTA",
      mensaje: "Se respondió por correo"
    })
    expect(s.success).not.toHaveBeenCalled()
    patch.flush(detailDto(17, { estado: "RESUELTA", estadoNombre: "Resuelta" }))
    await s.settle()

    expect(s.dialog(stateDialog)).toBeNull()
    expect(s.success).toHaveBeenCalledExactlyOnceWith(
      "Estado de la atención actualizado correctamente."
    )
    // The store invalidation re-reads the observed detail exactly once.
    const reread = s.http.expectOne(detailRead)
    expect(reread.request.method).toBe("GET")
    reread.flush(detailDto(17, { estado: "RESUELTA", estadoNombre: "Resuelta" }))
    await s.settle()
    expect(s.root().querySelector("[data-support-state]")?.textContent).toContain(
      "RESUELTA · Resuelta"
    )
    expect(patches).toHaveLength(1)
    s.http.expectNone(() => true)
  })

  it("omits the message when it is blank", async () => {
    const s = await detail()
    const element = await open(s)
    await s.fill("#support-state-target", "CERRADA", "change", element)
    await s.fill("#support-state-message", "   ", "input", element)
    await s.submit(element)
    const [patch] = s.patches()
    // An optional blank note is omitted instead of sent empty.
    expect(patch.request.body).toEqual({ estado: "CERRADA" })
    patch.flush(detailDto(17, { estado: "CERRADA", estadoNombre: "Cerrada" }))
    await s.settle()
    expect(s.success).toHaveBeenCalledTimes(1)
    s.http
      .expectOne(detailRead)
      .flush(detailDto(17, { estado: "CERRADA", estadoNombre: "Cerrada" }))
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("blocks a blank target, then surfaces a server 400 inline preserving the draft", async () => {
    const s = await detail()
    const element = await open(s)
    await s.submit(element)
    expect(element.querySelector("#support-state-target-errors")!.textContent).toMatch(
      /selecciona un estado/i
    )
    s.http.expectNone(request => request.method === "PATCH")

    await s.fill("#support-state-target", "EN_REVISION", "change", element)
    await s.fill("#support-state-message", "  Falta revisar  ", "input", element)
    await s.submit(element)
    const [patch] = s.patches()
    expect(patch.request.body).toEqual({ estado: "EN_REVISION", mensaje: "Falta revisar" })
    patch.flush({ mensaje: "RAW-PRIVATE" }, { status: 400, statusText: "Bad Request" })
    await s.settle()

    // A rejected transition is reported as the server answered it: inline, retryable.
    expect(s.dialog(stateDialog)).not.toBeNull()
    const alert = element.querySelector('[role="alert"]')!
    expect(alert).not.toBeNull()
    expect(alert.textContent).not.toContain("RAW-PRIVATE")
    expect(alert.textContent).toMatch(/rechaz|revisa|no se pudo/i)
    expect(element.querySelector<HTMLSelectElement>("#support-state-target")!.value).toBe(
      "EN_REVISION"
    )
    // The draft the user typed is preserved exactly, including its own padding.
    expect(element.querySelector<HTMLTextAreaElement>("#support-state-message")!.value).toBe(
      "  Falta revisar  "
    )
    expect(s.success).not.toHaveBeenCalled()
    // The write is never replayed automatically.
    s.http.expectNone(request => request.method === "PATCH")
    s.http.expectNone(() => true)
  })
})
