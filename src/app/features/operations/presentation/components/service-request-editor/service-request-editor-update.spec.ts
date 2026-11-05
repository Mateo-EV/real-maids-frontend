import { HttpTestingController } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  propertyDto,
  requestDto,
  setupUpdate,
  typeDto,
  properties,
  types
} from "./service-request-update.testing"

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

// T5 S1/S3/S4, L164: additive same-editor update, not a replacement of the
// frozen inbox/create tests. All actions below use labels, native fields and HTTP.
describe("WP7 request editor captured update mode", () => {
  it("prefills only editable fields and static supplied customer context, without any customer lookup", async () => {
    const s = await setupUpdate()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    expect(s.dialog().querySelector("[hlmDialogTitle]")?.textContent).toContain("Editar solicitud")
    for (const text of ["17", "Cliente capturado", "8", "Propiedad capturada", "Tipo capturado"])
      expect(s.dialog().textContent).toContain(text)
    const customer = s
      .dialog()
      .querySelector<HTMLInputElement | HTMLSelectElement>("#request-customerId")
    expect(
      !customer || customer.disabled || (customer instanceof HTMLInputElement && customer.readOnly)
    ).toBe(true)
    expect(s.dialog().querySelector("app-table-pagination")).toBeNull()
    for (const [key, value] of Object.entries({
      propertyId: "31",
      serviceTypeId: "4",
      description: "Descripción registrada",
      desiredDate: "2024-02-29"
    })) {
      expect(s.field(key).value).toBe(value)
      expect(s.dialog().querySelector(`label[for="request-${key}"]`)).not.toBeNull()
    }
    await s.choices()
    expect(s.field("propertyId").value).toBe("31")
    expect(s.field("serviceTypeId").value).toBe("4")
    expect(s.dialog().textContent).not.toMatch(/SYNTHETIC-ACCESS|SYNTHETIC-CODE|Caller/)
    s.http.expectNone(() => true)
  })

  it.each(["inactive-property", "missing", "failed", "pending"] as const)(
    "permits unchanged captured references with %s catalogs and never silently substitutes another ID",
    async mode => {
      const s = await setupUpdate()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      const propertyRead = s.http.expectOne(properties),
        typeRead = s.http.expectOne(types)
      if (mode === "failed") {
        propertyRead.error(new ProgressEvent("error"))
        typeRead.error(new ProgressEvent("error"))
      } else if (mode !== "pending") {
        propertyRead.flush(
          mode === "inactive-property"
            ? [propertyDto(31, false), propertyDto(32)]
            : [propertyDto(32)]
        )
        typeRead.flush(mode === "inactive-property" ? [typeDto()] : [typeDto(5)])
      }
      await s.settle()
      expect(s.field("propertyId").value).toBe("31")
      expect(s.field("serviceTypeId").value).toBe("4")
      expect(s.dialog().textContent).toContain("Propiedad capturada")
      if (mode === "missing" || mode === "pending")
        expect(s.dialog().textContent).toContain("Tipo capturado")
      await s.fill("description", "  Solo descripción  ")
      await s.submit()
      const update = s.put()
      expect(update.request.body).toEqual({
        idPropiedad: 31,
        idTipoServicio: 4,
        descripcion: "Solo descripción",
        fechaDeseada: "2024-02-29"
      })
      update.flush({}, { status: 403, statusText: "Forbidden" })
      await s.settle()
      if (mode === "pending") {
        propertyRead.flush([])
        typeRead.flush([])
        await s.settle()
      }
      expect(s.success).not.toHaveBeenCalled()
      expect(s.field("description").value).toBe("  Solo descripción  ")
      s.http.expectNone(() => true)
    }
  )

  it("sends exactly the full four-field replacement, trims nullable text and preserves calendar semantics", async () => {
    const s = await setupUpdate()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    await s.choices([propertyDto(31, false), propertyDto(32)], [typeDto(5)])
    await s.fill("propertyId", "32")
    await s.fill("serviceTypeId", "5")
    await s.fill("description", "  <b>Trabajo literal</b>  ")
    await s.fill("desiredDate", "2024-02-29")
    expect(s.field("desiredDate").getAttribute("min")).toBeNull()
    await s.submit()
    const update = s.put()
    expect(update.request.transferCache).toBe(false)
    expect(update.request.body).toEqual({
      idPropiedad: 32,
      idTipoServicio: 5,
      descripcion: "<b>Trabajo literal</b>",
      fechaDeseada: "2024-02-29"
    })
    update.flush({}, { status: 409, statusText: "Conflict" })
    await s.settle()
    expect(s.success).not.toHaveBeenCalled()
    expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
    // Returning to captured references is explicit, never an automatic fallback.
    await s.fill("propertyId", "31")
    await s.fill("serviceTypeId", "4")
    await s.fill("description", "   ")
    await s.fill("desiredDate", "")
    await s.submit()
    const retry = s.put()
    expect(retry.request.body).toEqual({
      idPropiedad: 31,
      idTipoServicio: 4,
      descripcion: null,
      fechaDeseada: null
    })
    retry.flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("rejects impossible dates and overlength text but accepts exactly 2000 trimmed characters", async () => {
    const s = await setupUpdate()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    await s.choices()
    ;(s.field("desiredDate") as HTMLInputElement).type = "text"
    await s.fill("desiredDate", "2025-02-29")
    await s.submit()
    s.http.expectNone(r => r.method === "PUT")
    expect(s.dialog().textContent).toMatch(/fecha|calendario/i)
    await s.fill("desiredDate", "")
    await s.fill("description", "x".repeat(2001))
    await s.submit()
    s.http.expectNone(r => r.method === "PUT")
    expect(s.dialog().textContent).toContain("2000")
    await s.fill("description", "  " + "x".repeat(2000) + "  ")
    await s.submit()
    const update = s.put()
    expect(update.request.body.descripcion).toBe("x".repeat(2000))
    update.flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
  })

  it.each(["propertyId", "serviceTypeId"] as const)(
    "requires fresh active verified membership only for changed %s",
    async key => {
      const start = Date.now()
      const clock = vi.spyOn(Date, "now").mockReturnValue(start)
      const s = await setupUpdate()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.choices(
        [propertyDto(), propertyDto(32), propertyDto(33, false)],
        [typeDto(), typeDto(5)]
      )
      await s.fill(key, key === "propertyId" ? "32" : "5")
      await s.fill("description", "Borrador conservado")
      clock.mockReturnValue(start + 120000)
      await s.submit()
      s.http.expectNone(() => true)
      expect(s.field(key).value).toBe(key === "propertyId" ? "32" : "5")
      expect(s.field("description").value).toBe("Borrador conservado")
      await s.click(
        key === "propertyId" ? "Actualizar propiedades" : "Actualizar tipos de servicio",
        s.dialog()
      )
      const revalidate = s.http.expectOne(key === "propertyId" ? properties : types)
      await s.submit()
      s.http.expectNone(r => r.method === "PUT")
      revalidate.error(new ProgressEvent("error"))
      await s.settle()
      await s.submit()
      s.http.expectNone(r => r.method === "PUT")
      await s.click(
        key === "propertyId" ? "Reintentar propiedades" : "Reintentar tipos de servicio",
        s.dialog()
      )
      s.http
        .expectOne(key === "propertyId" ? properties : types)
        .flush(key === "propertyId" ? [propertyDto(32)] : [typeDto(5)])
      await s.settle()
      await s.submit()
      const update = s.put()
      expect(update.request.body).toEqual({
        idPropiedad: key === "propertyId" ? 32 : 31,
        idTipoServicio: key === "serviceTypeId" ? 5 : 4,
        descripcion: "Borrador conservado",
        fechaDeseada: "2024-02-29"
      })
      update.flush({}, { status: 403, statusText: "Forbidden" })
      await s.settle()
    }
  )

  it.each(["inactive", "foreign", "missing"] as const)(
    "blocks changed %s property without erasing draft or selecting a default",
    async mode => {
      const s = await setupUpdate()
      s.read().flush(requestDto())
      await s.settle()
      await s.open()
      await s.choices(
        mode === "foreign"
          ? [propertyDto(32, true, 9)]
          : mode === "inactive"
            ? [propertyDto(32, false)]
            : [],
        [typeDto()]
      )
      await s.injectChoice("propertyId", "32")
      await s.fill("description", "Conservar")
      await s.submit()
      s.http.expectNone(r => r.method === "PUT")
      expect(s.field("propertyId").value).toBe("32")
      expect(s.field("description").value).toBe("Conservar")
      expect(s.success).not.toHaveBeenCalled()
    }
  )

  it("preserves a changed type that disappears after verified refresh, blocking dispatch instead of silently reverting", async () => {
    const s = await setupUpdate()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    await s.choices([propertyDto()], [typeDto(), typeDto(5)])
    await s.fill("serviceTypeId", "5")
    await s.click("Actualizar tipos de servicio", s.dialog())
    s.http.expectOne(types).flush([])
    await s.settle()
    expect(s.field("serviceTypeId").value).toBe("5")
    expect(s.dialog().textContent).toMatch(/no disponible/i)
    await s.submit()
    s.http.expectNone(r => r.method === "PUT")
    await s.fill("serviceTypeId", "4")
    await s.submit()
    s.put().flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
  })

  it("blocks duplicate saves and Cancel/Escape/outside while pending; confirmed success alone toasts and refreshes once", async () => {
    const s = await setupUpdate()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    await s.choices()
    await s.submit()
    await s.submit()
    const update = s.put()
    expect(s.store.writing()).toBe(true)
    expect(s.success).not.toHaveBeenCalled()
    for (const key of ["propertyId", "serviceTypeId", "description", "desiredDate"])
      expect(s.field(key).disabled).toBe(true)
    const cancel = s.button("Cancelar", s.dialog())!
    expect(cancel.disabled).toBe(true)
    cancel.click()
    const overlay = s.overlay()
    ;(overlay.keydownEvents() as Subject<KeyboardEvent>).next(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    )
    ;(overlay.backdropClick() as Subject<MouseEvent>).next(new MouseEvent("click"))
    ;(overlay.outsidePointerEvents() as Subject<MouseEvent>).next(new MouseEvent("click"))
    await s.settle()
    expect(update.cancelled).toBe(false)
    expect(s.editor()).not.toBeNull()
    s.http.expectNone(() => true)
    update.flush(requestDto())
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Solicitud actualizada correctamente.")
    expect(s.history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    s.read().flush({ ...requestDto(), descripcion: "Confirmado por GET" })
    await s.settle()
    expect(s.root().textContent).toContain("Confirmado por GET")
    expect(s.store.writing()).toBe(false)
    s.http.expectNone(() => true)
  })

  it("rejects a valid wrong-owner success DTO inline without feedback, cache invalidation or false close", async () => {
    const s = await setupUpdate()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    await s.choices()
    await s.fill("description", "Mi borrador")
    const before = s.store.selectRequest(17)
    await s.submit()
    s.put().flush({ ...requestDto(), idCliente: 9, cliente: "Otro cliente" })
    await s.settle()
    expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
    expect(s.field("description").value).toBe("Mi borrador")
    expect(s.success).not.toHaveBeenCalled()
    expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
    expect(s.store.selectRequest(17)).toEqual(before)
    s.http.expectNone(() => true)
    await s.submit()
    s.put().flush({}, { status: 409, statusText: "Conflict" })
    await s.settle()
  })

  it("retains safe inline errors and retries only explicitly; failed post-success GET never replays PUT", async () => {
    const s = await setupUpdate()
    s.read().flush(requestDto())
    await s.settle()
    await s.open()
    await s.choices()
    await s.fill("description", "Mi borrador")
    await s.submit()
    s.put().flush({ mensaje: "RAW INTERNAL" }, { status: 409, statusText: "Conflict" })
    await s.settle()
    expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
    expect(s.dialog().textContent).not.toContain("RAW INTERNAL")
    expect(s.field("description").value).toBe("Mi borrador")
    expect(s.success).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
    await s.submit()
    s.put().flush(requestDto())
    await s.settle()
    s.read().error(new ProgressEvent("error"))
    await s.settle()
    expect(s.success).toHaveBeenCalledTimes(1)
    expect(s.root().textContent).toMatch(/desactualizados/i)
    await s.click("Reintentar")
    s.read().flush(requestDto())
    await s.settle()
    s.http.expectNone(() => true)
  })
})
