import { HttpTestingController } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SupportRequestsStore } from "../../state/support-requests.store"
import {
  caller,
  deadline,
  detailDto,
  followUpDto,
  requestsUrl,
  setupSupportWrites
} from "../support-write.testing"

const messageDialog = "app-support-message-dialog"
const detailRead = `${requestsUrl}/17`
const followUpWrite = `${requestsUrl}/17/seguimiento`

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

/**
 * WP8 T8 / S5, S6, S11: the reply consumer over one verified record. The transport is
 * the real one, so the asserted body is the documented `mensaje` payload.
 */
describe("Support message consumer", () => {
  async function detail() {
    const s = await setupSupportWrites("/admin/support/17")
    s.http.expectOne(detailRead).flush(detailDto())
    await s.settle()
    return s
  }

  async function open(s: Awaited<ReturnType<typeof detail>>) {
    await s.click("Agregar mensaje")
    const element = s.dialog(messageDialog)
    expect(element, "Message dialog must be mounted").not.toBeNull()
    return element!
  }

  it("sends the trimmed message for the loaded request and confirms with one toast", async () => {
    const s = await detail()
    const element = await open(s)
    expect(element.textContent).toContain("No puedo ver mi factura")
    const text = element.querySelector<HTMLTextAreaElement>("#support-message-text")!
    expect(text.value).toBe("")
    await s.fill("#support-message-text", "  Revisamos tu factura\n  ", "input", element)
    await s.submit(element)

    const posts = s.posts()
    expect(posts).toHaveLength(1)
    const [post] = posts
    expect(post.request.url).toBe(followUpWrite)
    expect(post.request.transferCache).toBe(false)
    // Only the trimmed message travels; author, timestamp and state stay server-owned.
    expect(post.request.body).toEqual({ mensaje: "Revisamos tu factura" })
    expect(s.success).not.toHaveBeenCalled()
    post.flush(detailDto(17, {}, [followUpDto(91, "Agente de soporte", "Revisamos tu factura")]))
    await s.settle()

    expect(s.dialog(messageDialog)).toBeNull()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Mensaje agregado correctamente.")
    // The store invalidation re-reads the observed detail exactly once and the page
    // renders the supplied follow-up from that read: no optimistic append.
    const reread = s.http.expectOne(detailRead)
    expect(reread.request.method).toBe("GET")
    reread.flush(detailDto(17, {}, [followUpDto(91, "Agente de soporte", "Revisamos tu factura")]))
    await s.settle()
    expect(s.root().textContent).toContain("Revisamos tu factura")
    expect(posts).toHaveLength(1)
    s.http.expectNone(() => true)
  })

  it("blocks an empty and an over-limit message without dispatching", async () => {
    const s = await detail()
    const element = await open(s)
    await s.fill("#support-message-text", "    ", "input", element)
    const errors = () => element.querySelector("#support-message-text-errors")!.textContent
    await s.submit(element)
    expect(errors()).toMatch(/obligatorio/i)
    s.http.expectNone(request => request.method === "POST")
    await s.fill("#support-message-text", "x".repeat(4001), "input", element)
    await s.submit(element)
    expect(errors()).toMatch(/4000/)
    expect(element.querySelector<HTMLTextAreaElement>("#support-message-text")!.value).toHaveLength(
      4001
    )
    s.http.expectNone(() => true)
  })

  it("keeps one pending write, blocks dismissal and preserves the draft on failure", async () => {
    const s = await detail()
    const element = await open(s)
    await s.fill("#support-message-text", "Borrador persistente", "input", element)
    await s.submit(element)
    const [post] = s.posts()
    const submit = element.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(submit.disabled).toBe(true)
    await s.submit(element)
    s.http.expectNone(request => request.method === "POST")
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    s.overlay(element).backdropElement!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await s.settle()
    expect(s.dialog(messageDialog)).not.toBeNull()
    expect(element.querySelector<HTMLButtonElement>("#support-message-cancel")!.disabled).toBe(true)

    post.flush({ mensaje: "RAW-PRIVATE" }, { status: 500, statusText: "Server Error" })
    await s.settle()
    expect(s.dialog(messageDialog)).not.toBeNull()
    const alert = element.querySelector('[role="alert"]')!
    expect(alert).not.toBeNull()
    expect(alert.textContent).not.toContain("RAW-PRIVATE")
    expect(element.querySelector<HTMLTextAreaElement>("#support-message-text")!.value).toBe(
      "Borrador persistente"
    )
    expect(s.success).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
  })

  it("shows no feedback for a pending reply completed after session replacement", async () => {
    const s = await detail()
    const element = await open(s)
    await s.fill("#support-message-text", "Mensaje descartado", "input", element)
    await s.submit(element)
    const [post] = s.posts()
    s.session.next(caller(20, deadline, "Replacement"))
    await s.settle()
    expect(post.cancelled).toBe(true)
    expect(s.dialog(messageDialog)).toBeNull()
    expect(s.success).not.toHaveBeenCalled()
    expect(TestBed.inject(SupportRequestsStore).writing()).toBe(false)
    s.http.expectNone(() => true)
  })

  it("fences a retained form submit during the closing animation", async () => {
    const s = await detail()
    const element = await open(s)
    await s.fill("#support-message-text", "Mensaje descartado", "input", element)
    const retained = element.querySelector("form")!
    // Idle dismissal closes the overlay; a submit from the still-mounted form is obsolete.
    element.querySelector<HTMLButtonElement>("#support-message-cancel")!.click()
    retained.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await s.settle()
    expect(s.dialog(messageDialog)).toBeNull()
    expect(s.success).not.toHaveBeenCalled()
    expect(TestBed.inject(SupportRequestsStore).writing()).toBe(false)
    s.http.expectNone(() => true)
  })
})
