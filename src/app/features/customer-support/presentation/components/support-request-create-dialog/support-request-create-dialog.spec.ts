import { HttpTestingController } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SupportRequestsStore } from "../../state/support-requests.store"
import {
  caller,
  customerDto,
  customerPageDto,
  detailDto,
  pageDto,
  requestsUrl,
  setupSupportWrites,
  types,
  typesUrl,
  customersUrl,
  deadline
} from "../support-write.testing"

const createDialog = "app-support-request-create-dialog"

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

/**
 * WP8 T8 / S5, S6, S11: the create consumer. Every assertion goes through the rendered
 * overlay and the real root store + HTTP validators, so the documented wire body is what
 * is being checked, not a store double. Live backend, browser and accessibility
 * acceptance are out of scope here.
 */
describe("Support request create consumer", () => {
  async function inbox() {
    const s = await setupSupportWrites()
    s.http
      .expectOne(request => request.url === requestsUrl && request.method === "GET")
      .flush(pageDto(0, 20, 1))
    s.http.expectOne(typesUrl).flush(types)
    const customers = s.http.expectOne(request => request.url === customersUrl)
    expect(customers.request.method).toBe("GET")
    expect(customers.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
    expect([
      customers.request.params.get("pagina"),
      customers.request.params.get("tamanio")
    ]).toEqual(["0", "20"])
    expect(customers.request.transferCache).toBe(false)
    customers.flush(customerPageDto([customerDto(8)]))
    await s.settle()
    return s
  }

  async function open(s: Awaited<ReturnType<typeof inbox>>) {
    await s.click("Crear atención")
    const element = s.dialog(createDialog)
    expect(element, "Create dialog must be mounted").not.toBeNull()
    return element!
  }

  /** The panel of the customer picker: it never filters or pages on its own. */
  async function picker(s: Awaited<ReturnType<typeof inbox>>, element: HTMLElement) {
    const find = () =>
      document
        .getElementById("support-create-customerId-options")
        ?.closest("hlm-combobox-content") as HTMLElement | null
    let panel = find()
    if (!panel) {
      element.querySelector<HTMLButtonElement>("button#support-create-customerId")!.click()
      await s.settle()
      panel = find()
    }
    expect(panel, "Customer picker panel").not.toBeNull()
    return panel!
  }

  async function chooseCustomer(
    s: Awaited<ReturnType<typeof inbox>>,
    element: HTMLElement,
    value: string
  ) {
    const panel = await picker(s, element)
    const options = () =>
      Array.from(panel.querySelectorAll<HTMLElement>('[role="option"]')).map(option => [
        option.getAttribute("data-value"),
        option.textContent?.trim()
      ])
    expect(options(), "Only the verified page is offered").toEqual([["8", "Cliente 8"]])
    const option = Array.from(panel.querySelectorAll<HTMLElement>('[role="option"]')).find(
      item => item.getAttribute("data-value") === value
    )
    expect(option).toBeDefined()
    option!.scrollIntoView = vi.fn()
    option!.click()
    await s.settle()
  }

  it("reads its choices from the real sources and blocks a blank required choice", async () => {
    const s = await inbox()
    const element = await open(s)
    // Opening adds no read: both catalogs join the entries the inbox already verified.
    s.http.expectNone(() => true)
    expect(element.querySelector("h2")?.textContent).toContain("Crear atención")
    expect(element.querySelectorAll("app-catalog-combobox")).toHaveLength(1)
    const select = element.querySelector<HTMLSelectElement>("#support-create-typeId")!
    // S8: the type catalog carries the supplied names; the blank choice is required.
    expect(
      Array.from(select.options).map(option => [option.value, option.textContent?.trim()])
    ).toEqual([
      ["", "Selecciona tipo de atención"],
      ["4", "Consulta"],
      ["7", "Queja"]
    ])
    const subject = element.querySelector<HTMLInputElement>("#support-create-subject")!
    const description = element.querySelector<HTMLTextAreaElement>("#support-create-description")!
    expect([subject.value, description.value]).toEqual(["", ""])
    // A blank customer and type are required: the submission never reaches the transport.
    const errors = (id: string) =>
      element.querySelector(`#support-create-${id}-errors`)!.textContent
    await s.submit(element)
    expect(errors("customerId")).toMatch(/selecciona un cliente/i)
    expect(errors("typeId")).toMatch(/selecciona un tipo/i)
    expect(errors("subject")).toMatch(/obligatori/i)
    expect(errors("description")).toMatch(/obligatori/i)
    expect(s.posts()).toHaveLength(0)
    s.http.expectNone(() => true)
  })

  it("sends only the trimmed documented fields and confirms with one toast", async () => {
    const s = await inbox()
    const element = await open(s)
    await chooseCustomer(s, element, "8")
    await s.fill("#support-create-typeId", "7", "change", element)
    await s.fill("#support-create-subject", "  Asunto con espacios  ", "input", element)
    await s.fill("#support-create-description", "  Descripción literal\n  ", "input", element)
    await s.submit(element)

    const posts = s.posts()
    expect(posts).toHaveLength(1)
    const [post] = posts
    expect(post.request.url).toBe(requestsUrl)
    expect(post.request.transferCache).toBe(false)
    // Trimmed text, documented keys only, and no inferred order/actor/state.
    expect(post.request.body).toEqual({
      idCliente: 8,
      idTipo: 7,
      asunto: "Asunto con espacios",
      descripcion: "Descripción literal"
    })
    expect(s.success).not.toHaveBeenCalled()
    post.flush(detailDto(23, { idAtencion: 23, idCliente: 8, idTipo: 7, tipo: "Queja" }, []))
    await s.settle()

    expect(s.dialog(createDialog)).toBeNull()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Atención creada correctamente.")
    // The store's own invalidation revalidates the observed inbox once: no page reload
    // and no optimistic row were added by the dialog or its page.
    const reread = s.http.expectOne(
      request => request.url === requestsUrl && request.method === "GET"
    )
    expect(reread.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
    reread.flush(pageDto(0, 20, 2))
    await s.settle()
    expect(posts).toHaveLength(1)
    s.http.expectNone(() => true)
  })

  it("rejects an over-limit subject and description inline without dispatching", async () => {
    const s = await inbox()
    const element = await open(s)
    await chooseCustomer(s, element, "8")
    await s.fill("#support-create-typeId", "4", "change", element)
    await s.fill("#support-create-subject", "x".repeat(151), "input", element)
    await s.fill("#support-create-description", "y".repeat(4001), "input", element)
    const errors = (id: string) =>
      element.querySelector(`#support-create-${id}-errors`)!.textContent
    await s.submit(element)
    expect(errors("subject")).toMatch(/150/)
    expect(errors("description")).toMatch(/4000/)
    // The draft is preserved exactly as typed and nothing was dispatched.
    expect(element.querySelector<HTMLInputElement>("#support-create-subject")!.value).toHaveLength(
      151
    )
    expect(
      element.querySelector<HTMLTextAreaElement>("#support-create-description")!.value
    ).toHaveLength(4001)
    expect(s.posts()).toHaveLength(0)
    s.http.expectNone(() => true)
  })

  it("keeps one pending write, blocks dismissal and preserves the draft through renewal", async () => {
    const s = await inbox()
    const element = await open(s)
    await chooseCustomer(s, element, "8")
    await s.fill("#support-create-typeId", "4", "change", element)
    await s.fill("#support-create-subject", "Asunto pendiente", "input", element)
    await s.fill("#support-create-description", "Descripción pendiente", "input", element)
    await s.submit(element)
    const [post] = s.posts()
    const submit = element.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(submit.disabled).toBe(true)
    // A second submission is impossible from the UI and never reaches the transport.
    await s.submit(element)
    s.http.expectNone(request => request.method === "POST")
    // Dismissal is blocked while pending: Escape, outside click and Cancel do nothing.
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    s.overlay(element).backdropElement!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await s.settle()
    expect(s.dialog(createDialog)).not.toBeNull()
    expect(element.querySelector<HTMLButtonElement>("#support-create-cancel")?.disabled).toBe(true)
    // A credential renewal of the same session preserves the work in flight.
    s.session.next(caller(19, deadline, "Renewed"))
    await s.settle()
    expect(post.cancelled).toBe(false)
    expect(element.querySelector<HTMLInputElement>("#support-create-subject")!.value).toBe(
      "Asunto pendiente"
    )
    post.flush(detailDto(23, { idAtencion: 23, idTipo: 4 }, []))
    await s.settle()
    expect(s.dialog(createDialog)).toBeNull()
    expect(s.success).toHaveBeenCalledTimes(1)
    s.http
      .expectOne(request => request.url === requestsUrl && request.method === "GET")
      .flush(pageDto(0, 20, 2))
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("keeps the dialog open with the draft and no feedback on a safe failure", async () => {
    const s = await inbox()
    const element = await open(s)
    await chooseCustomer(s, element, "8")
    await s.fill("#support-create-typeId", "4", "change", element)
    await s.fill("#support-create-subject", "Asunto conservado", "input", element)
    await s.fill("#support-create-description", "Descripción conservada", "input", element)
    await s.submit(element)
    const [post] = s.posts()
    post.flush({ mensaje: "RAW-PRIVATE" }, { status: 400, statusText: "Bad Request" })
    await s.settle()

    expect(s.dialog(createDialog)).not.toBeNull()
    const alert = () => element.querySelector('[role="alert"]')!
    expect(alert()).not.toBeNull()
    expect(alert().textContent).not.toContain("RAW-PRIVATE")
    expect(alert().textContent).toMatch(/revisa|no se pudo/i)
    expect(element.querySelector<HTMLInputElement>("#support-create-subject")!.value).toBe(
      "Asunto conservado"
    )
    expect(element.querySelector<HTMLTextAreaElement>("#support-create-description")!.value).toBe(
      "Descripción conservada"
    )
    expect(s.success).not.toHaveBeenCalled()
    // The failed write is not replayed; a retry is the user's explicit decision.
    s.http.expectNone(() => true)
  })

  it.each(["replacement", "destroy"] as const)(
    "shows no feedback for a completion after %s",
    async fence => {
      const s = await inbox()
      const element = await open(s)
      await chooseCustomer(s, element, "8")
      await s.fill("#support-create-typeId", "4", "change", element)
      await s.fill("#support-create-subject", "Asunto descartado", "input", element)
      await s.fill("#support-create-description", "Descripción descartada", "input", element)
      await s.submit(element)
      const [post] = s.posts()
      if (fence === "replacement") {
        s.session.next(caller(20, deadline, "Replacement"))
        await s.settle()
        // The replacement identity reads its own catalogs; those are not this write.
        s.http
          .expectOne(request => request.url === requestsUrl && request.method === "GET")
          .flush(pageDto(0, 20, 1))
        s.http.expectOne(typesUrl).flush(types)
        s.http
          .expectOne(request => request.url === customersUrl)
          .flush(customerPageDto([customerDto(8)]))
        await s.settle()
      } else {
        s.harness.fixture.destroy()
        // Let the teardown queue drain: no render is scheduled, only disposal work.
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      expect(post.cancelled).toBe(true)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.dialog(createDialog)).toBeNull()
      // The shared pending gate is released: nothing is left "writing".
      expect(TestBed.inject(SupportRequestsStore).writing()).toBe(false)
      s.http.expectNone(() => true)
    }
  )
})
