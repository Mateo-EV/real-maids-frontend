import { HttpTestingController } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { Router } from "@angular/router"
import { afterEach, describe, expect, it } from "vitest"
import {
  caller,
  createdOrderDto,
  detailUrl,
  requestDto,
  setupOrderCreate
} from "./service-request-order-create.testing"

afterEach(() => TestBed.inject(HttpTestingController).verify())

describe("T6G captured-request order creation (S1/S3/S4/S5/S6/S9/S10)", () => {
  it("offers creation only after matching registered detail and captures safe identity without lookups or early POST", async () => {
    const s = await setupOrderCreate()
    expect(s.button("Crear orden")).toBeUndefined()
    s.read().flush(requestDto())
    await s.settle()
    expect(s.button("Editar solicitud")).toBeDefined()
    expect(s.button("Cancelar solicitud")).toBeDefined()
    await s.open()
    expect(s.dialog()!.textContent).toContain("Cliente capturado")
    expect(s.dialog()!.textContent).toContain("17")
    expect(s.dialog()!.textContent).toMatch(/irreversible/i)
    expect(s.dialog()!.textContent).toMatch(/idempotente/i)
    expect(s.dialog()!.textContent).toMatch(/atendida/i)
    for (const name of ["amount", "observation"] as const) {
      expect(s.field(name).value).toBe("")
      expect(s.dialog()!.querySelector(`label[for="order-create-${name}"]`)).not.toBeNull()
    }
    expect(s.dialog()!.textContent).not.toContain("SYNTHETIC")
    expect(s.dialog()!.querySelectorAll("select")).toHaveLength(0)
    expect(s.success).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
    await s.click("Cancelar", s.dialog()!)
    expect(s.dialog()).toBeNull()
    expect(s.link()).toBeUndefined()
    s.http.expectNone(() => true)
  })

  it.each(["atendida", "cancelada"])("never creates from loaded %s request", async estado => {
    const s = await setupOrderCreate()
    s.read().flush({ ...requestDto(), estado })
    await s.settle()
    expect(s.button("Crear orden")).toBeUndefined()
    expect(s.success).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
  })

  it("does not expose creation after a wrong-target detail response", async () => {
    const s = await setupOrderCreate()
    s.read().flush(requestDto(18))
    await s.settle()
    expect(s.button("Crear orden")).toBeUndefined()
    expect(s.success).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
  })

  it.each(["-1", "100000000", "0.001", "1e2", "1,20", "+2", "NaN", " 2 "])(
    "rejects malformed/out-of-bound amount %s without any write/effect",
    async value => {
      const s = await setupOrderCreate()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.fill("amount", value)
      await s.submit()
      expect(s.dialog()).not.toBeNull()
      expect(s.orders.writing()).toBe(false)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
      expect(s.link()).toBeUndefined()
      s.http.expectNone(() => true)
    }
  )

  it("rejects observation over 2000 without mutation or lost draft", async () => {
    const s = await setupOrderCreate()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    await s.fill("observation", "x".repeat(2001))
    await s.submit()
    expect(s.field("observation").value).toHaveLength(2001)
    expect(s.success).not.toHaveBeenCalled()
    expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
    expect(s.orders.writing()).toBe(false)
    s.http.expectNone(() => true)
  })

  it.each([
    { amount: "", observation: "   ", wireAmount: null, wireObservation: null },
    { amount: "0", observation: "", wireAmount: 0, wireObservation: null },
    {
      amount: "99999999.99",
      observation: "x".repeat(2000),
      wireAmount: 99999999.99,
      wireObservation: "x".repeat(2000)
    },
    {
      amount: "12.30",
      observation: "  <b>Literal</b>\n  ",
      wireAmount: 12.3,
      wireObservation: "  <b>Literal</b>\n  "
    }
  ])(
    "sends only captured request/amount/observation and confirms actual returned link: $amount",
    async row => {
      const s = await setupOrderCreate()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.fill("amount", row.amount)
      await s.fill("observation", row.observation)
      await s.submit()
      const post = s.post()
      expect(post.request.body).toEqual({
        idSolicitud: 17,
        montoEstimado: row.wireAmount,
        observacion: row.wireObservation
      })
      expect(post.request.transferCache).toBe(false)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.link()).toBeUndefined()
      expect(TestBed.inject(Router).url).toBe(detailUrl)
      post.flush(createdOrderDto())
      await s.settle()
      expect(s.dialog()).toBeNull()
      expect(s.success).toHaveBeenCalledExactlyOnceWith("Orden creada correctamente.")
      expect(s.history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
      expect(s.link()!.getAttribute("href")).toBe("/admin/operations/orders/73")
      expect(TestBed.inject(Router).url).toBe(detailUrl)
      // Only the root's existing observed-request invalidation may read again.
      s.read().flush({ ...requestDto(), estado: "atendida" })
      await s.settle()
      expect(s.button("Crear orden")).toBeUndefined()
      s.http.expectNone(() => true)
    }
  )

  it("preserves pending draft through same-ID query navigation and renewal while blocking duplicates/Escape/outside/Cancel", async () => {
    const s = await setupOrderCreate({ browserHistory: true })
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    await s.fill("amount", "5.20")
    await s.fill("observation", "Borrador")
    await s.submit()
    const post = s.post()
    expect(s.button("Cancelar", s.dialog()!)!.disabled).toBe(true)
    expect(s.dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(
      true
    )
    await s.submit()
    s.overlay().backdropElement!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await s.navigate(detailUrl + "?page=4&size=10")
    s.session.next(caller(19, "Renewed"))
    await s.settle()
    expect(post.cancelled).toBe(false)
    expect(s.field("observation").value).toBe("Borrador")
    expect(s.field("amount").value).toBe("5.20")
    expect(s.success).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
    post.flush(createdOrderDto())
    await s.settle()
    s.read().flush({ ...requestDto(), estado: "atendida" })
    await s.settle()
    expect(s.link()!.getAttribute("href")).toBe("/admin/operations/orders/73")
    const back = [...s.root().querySelectorAll<HTMLAnchorElement>("a")].find(
      anchor => anchor.textContent?.trim() === "Volver a solicitudes"
    )
    expect(back?.getAttribute("href")).toBe("/admin/operations/requests?page=4&size=10")
    s.http.expectNone(() => true)
  })

  it.each([403, 409, 0])(
    "keeps safe draft on %s failure, no retry/GET/toast/link/invalidation",
    async status => {
      const s = await setupOrderCreate()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.fill("amount", "12.30")
      await s.fill("observation", "Borrador persistente")
      await s.submit()
      const post = s.post()
      if (status === 0) post.error(new ProgressEvent("error"))
      else post.flush({ mensaje: "RAW-PRIVATE" }, { status, statusText: "Failure" })
      await s.settle()
      expect(s.field("amount").value).toBe("12.30")
      expect(s.field("observation").value).toBe("Borrador persistente")
      expect(s.dialog()!.querySelector('[role="alert"]')).not.toBeNull()
      expect(s.dialog()!.textContent).not.toContain("RAW-PRIVATE")
      if (status === 0) expect(s.dialog()!.textContent).toMatch(/consulta|comprueba/i)
      expect(s.orders.writing()).toBe(false)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
      expect(s.link()).toBeUndefined()
      s.http.expectNone(() => true)
    }
  )

  it("retries a failed write only after another explicit confirmation, retaining captured payload", async () => {
    const s = await setupOrderCreate()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    await s.fill("amount", "7.50")
    await s.fill("observation", "Borrador")
    await s.submit()
    s.post().flush({}, { status: 409, statusText: "Conflict" })
    await s.settle()
    s.http.expectNone(() => true)
    expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
    await s.submit()
    const retried = s.post()
    expect(retried.request.body).toEqual({
      idSolicitud: 17,
      montoEstimado: 7.5,
      observacion: "Borrador"
    })
    retried.flush(createdOrderDto(81))
    await s.settle()
    s.read().flush({ ...requestDto(), estado: "atendida" })
    await s.settle()
    expect(s.link()!.getAttribute("href")).toBe("/admin/operations/orders/81")
    expect(s.success).toHaveBeenCalledTimes(1)
    expect(s.history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    s.http.expectNone(() => true)
  })

  it("fences a retained form submit during idle closing without writing or feedback", async () => {
    const s = await setupOrderCreate()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    const retained = s.dialog()!.querySelector("form")!
    s.button("Cancelar", s.dialog()!)!.click()
    // Do not wait for the exit animation: a retained form is already obsolete.
    retained.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await s.settle()
    expect(s.dialog()).toBeNull()
    expect(s.orders.writing()).toBe(false)
    expect(s.success).not.toHaveBeenCalled()
    expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
  })

  it.each(["escape", "outside"] as const)(
    "permits guarded idle %s dismissal without write",
    async action => {
      const s = await setupOrderCreate()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      if (action === "outside")
        s.overlay().backdropElement!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      else
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      await s.settle()
      expect(s.dialog()).toBeNull()
      expect(s.success).not.toHaveBeenCalled()
      s.http.expectNone(() => true)
    }
  )

  it.each(["owner", "linkage", "state", "id"] as const)(
    "rejects invalid success %s without feedback/read/invalidation",
    async kind => {
      const s = await setupOrderCreate()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.submit()
      const dto = createdOrderDto()
      if (kind === "owner") dto.orden.idCliente = 9
      if (kind === "linkage") dto.orden.idSolicitud = 18
      if (kind === "state") dto.orden.estado = "PROGRAMADA"
      if (kind === "id") dto.orden.idOrden = 0
      s.post().flush(dto)
      await s.settle()
      expect(s.dialog()).not.toBeNull()
      expect(s.dialog()!.querySelector('[role="alert"]')).not.toBeNull()
      expect(s.success).not.toHaveBeenCalled()
      expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
      expect(s.link()).toBeUndefined()
      s.http.expectNone(() => true)
    }
  )

  it.each(["owner", "away", "destroy", "replacement", "logout"] as const)(
    "cancels and fences pending creation on %s",
    async action => {
      const s = await setupOrderCreate()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.submit()
      const post = s.post()
      if (action === "owner") await s.navigate("/admin/operations/requests/18")
      else if (action === "away") await s.navigate("/away")
      else if (action === "destroy") s.harness.fixture.destroy()
      else s.session.next(action === "logout" ? null : caller(20))
      if (action !== "destroy") await s.settle()
      expect(post.cancelled).toBe(true)
      expect(s.orders.writing()).toBe(false)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
      if (action === "owner") {
        s.read(18).flush(requestDto(18))
        await s.settle()
        expect(s.link()).toBeUndefined()
      }
      s.http.expectNone(() => true)
    }
  )

  it.each(["owner", "replacement", "logout"] as const)(
    "clears ephemeral confirmed link on %s",
    async action => {
      const s = await setupOrderCreate()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.submit()
      s.post().flush(createdOrderDto())
      await s.settle()
      s.read().flush({ ...requestDto(), estado: "atendida" })
      await s.settle()
      expect(s.link()).toBeDefined()
      if (action === "owner") {
        await s.navigate("/admin/operations/requests/18")
        s.read(18).flush(requestDto(18))
      } else s.session.next(action === "logout" ? null : caller(20))
      await s.settle()
      expect(s.link()).toBeUndefined()
      s.http.expectNone(() => true)
    }
  )

  it("retains confirmed link through GET failure, retry GET only, and same-session renewal", async () => {
    const s = await setupOrderCreate()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    await s.submit()
    s.post().flush(createdOrderDto())
    await s.settle()
    s.read().flush({}, { status: 503, statusText: "Unavailable" })
    await s.settle()
    expect(s.link()).toBeDefined()
    expect(s.success).toHaveBeenCalledTimes(1)
    s.session.next(caller(19, "Renewed"))
    await s.settle()
    expect(s.link()).toBeDefined()
    await s.click("Reintentar")
    s.read().flush({ ...requestDto(), estado: "atendida" })
    await s.settle()
    s.http.expectNone(() => true)
    expect(s.success).toHaveBeenCalledTimes(1)
  })

  it.each([{ server: true }, { guest: true }])(
    "dispatches no creation/auth initialization on SSR or guest: %j",
    async options => {
      const s = await setupOrderCreate(options)
      expect(s.button("Crear orden")).toBeUndefined()
      expect(s.success).not.toHaveBeenCalled()
      s.http.expectNone(() => true)
      if (options.server) {
        expect(s.authFactory).not.toHaveBeenCalled()
        expect(s.observeSession).not.toHaveBeenCalled()
      }
    }
  )
})
