import { HttpTestingController } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createCaller } from "../../state/service-orders-create.store.testing"
import { accessText, doorText, orderDetailApi } from "./service-order-detail-page.testing"
import {
  manualDetailDto,
  reasonDto,
  reasonsUrl,
  setupManual,
  staffPageDto
} from "./service-order-manual.testing"

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView"
)

afterEach(() => {
  TestBed.inject(HttpTestingController).verify()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalScrollIntoView)
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
  vi.useRealTimers()
})

// T6K S1/S2/S3/S6/S8/S9/S10: actual DOM → root actions → HTTP, no private store state.
describe("loaded order manual workflow", () => {
  async function loaded(kind: "schedule" | "team", dto = manualDetailDto()) {
    const s = await setupManual()
    s.read().flush(dto)
    await s.settle()
    await s.open(kind)
    if (kind === "schedule") s.http.expectOne(reasonsUrl).flush([reasonDto])
    else s.staffRead().flush(staffPageDto())
    await s.settle()
    return s
  }
  it("only exposes launchers after a matching verified order, with safe captured context", async () => {
    const s = await setupManual()
    expect(s.button("Programar orden")).toBeUndefined()
    expect(s.button("Reemplazar equipo")).toBeUndefined()
    s.read().flush(manualDetailDto())
    await s.settle()
    await s.open("schedule")
    s.http.expectOne(reasonsUrl).flush([reasonDto])
    await s.settle()
    const text = s.dialog()!.textContent!
    expect(text).toContain("17")
    expect(text).toContain("Cliente suministrado")
    expect(text).not.toContain(accessText)
    expect(text).not.toContain(doorText)
    expect(s.dialog()!.querySelector('label[for="order-schedule-date"]')).not.toBeNull()
    expect(s.dialog()!.querySelector('option[value="3"]')?.textContent?.trim()).toBe(
      reasonDto.nombre
    )
    expect(s.dialog()!.closest("[role=dialog]")?.textContent).toContain("Programar orden")
    s.http.expectNone(r => r.method !== "GET")
    await s.click("Cancelar", s.dialog()!)
    expect(s.dialog()).toBeNull()
    expect(s.success).not.toHaveBeenCalled()
  })
  it("sends literal civil date/clock precision and optional nulls, then refreshes only order detail once", async () => {
    const s = await loaded("schedule")
    await s.fill("order-schedule-date", "2024-02-29")
    await s.fill("order-schedule-start", "08:15:00.123456789")
    await s.fill("order-schedule-end", "")
    await s.submit()
    const put = s.put("schedule")
    expect(put.request.body).toEqual({
      fecha: "2024-02-29",
      horaInicio: "08:15:00.123456789",
      horaFin: null,
      idMotivo: null
    })
    expect(put.request.transferCache).toBe(false)
    expect(s.success).not.toHaveBeenCalled()
    expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
    put.flush(manualDetailDto().orden)
    s.read().flush(manualDetailDto())
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Programación confirmada.")
    expect(s.history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    s.http.expectNone(r => r.url.includes("solicitudes"))
    s.http.expectNone(r => r.method === "PUT")
  })
  it.each([
    ["order-schedule-date", "2025-02-29"],
    ["order-schedule-date", ""],
    ["order-schedule-start", "24:00"],
    ["order-schedule-start", "09:00:00.1234567890"],
    ["order-schedule-end", "25:20"]
  ])("blocks invalid %s without any write/invalidation", async (field, value) => {
    const s = await loaded("schedule")
    await s.fill(field, value)
    await s.submit()
    s.http.expectNone(r => r.method === "PUT")
    expect(s.success).not.toHaveBeenCalled()
    expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
    expect(s.dialog()).not.toBeNull()
  })
  it("retries failed reasons explicitly and sends only a verified selected ID", async () => {
    const s = await setupManual()
    s.read().flush(manualDetailDto())
    await s.settle()
    await s.open("schedule")
    s.http.expectOne(reasonsUrl).flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(s.dialog()!.textContent).toContain("No se pudieron consultar")
    await s.click("Reintentar motivos", s.dialog()!)
    s.http.expectOne(reasonsUrl).flush([reasonDto])
    await s.settle()
    await s.fill("order-schedule-reason", "3")
    await s.submit()
    expect(s.put("schedule").request.body.idMotivo).toBe(3)
    // Leave the request deliberately unresolved, then cancel through route ownership.
    await s.navigate("/away")
    expect(s.success).not.toHaveBeenCalled()
  })
  it("rejects an injected unverified reason option without HTTP", async () => {
    const s = await loaded("schedule")
    const select = s.dialog()!.querySelector<HTMLSelectElement>("#order-schedule-reason")!
    const option = document.createElement("option")
    option.value = "999"
    select.append(option)
    await s.fill("order-schedule-reason", "999")
    await s.submit()
    s.http.expectNone(r => r.method === "PUT")
    expect(s.dialog()!.textContent).toContain("motivo activo verificado")
  })
  it("preserves loaded unknown team roles until an explicit valid choice, without another staff detail lookup", async () => {
    const dto = manualDetailDto()
    dto.orden.asignados[0].rol = "responsable_legacy"
    const s = await loaded("team", dto)
    expect(s.dialog()!.textContent).toContain("responsable_legacy")
    const select = s.dialog()!.querySelector<HTMLSelectElement>("#order-team-role-21")!
    expect(select.value).toBe("")
    await s.fill("order-team-confirm", true)
    await s.submit()
    s.http.expectNone(r => r.method === "PUT")
    await s.fill("order-team-role-21", "RESPONSABLE")
    expect(s.dialog()!.querySelector<HTMLInputElement>("#order-team-confirm")!.checked).toBe(false)
    await s.fill("order-team-confirm", true)
    await s.submit()
    const put = s.put("team")
    expect(put.request.body).toEqual({ asignaciones: [{ idPersonal: 21, rol: "RESPONSABLE" }] })
    put.flush(manualDetailDto().orden)
    s.read().flush(manualDetailDto())
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Reemplazo de equipo confirmado.")
    s.http.expectNone(r => /personal\/\d+/.test(r.url))
  })
  it("requires explicit destructive confirmation for empty full replacement", async () => {
    const s = await loaded("team")
    await s.click("Retirar a Personal capturado", s.dialog()!)
    expect(s.dialog()!.textContent).toContain("TODAS las asignaciones")
    await s.submit()
    s.http.expectNone(r => r.method === "PUT")
    await s.fill("order-team-confirm", true)
    await s.submit()
    const put = s.put("team")
    expect(put.request.body).toEqual({ asignaciones: [] })
    put.flush(manualDetailDto().orden)
    s.read().flush(manualDetailDto())
    await s.settle()
    expect(s.history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    expect(s.success).toHaveBeenCalledTimes(1)
  })
  it("uses paged staff choices and effective metadata without downloading a catalog or inferring user IDs", async () => {
    const s = await setupManual()
    s.read().flush(manualDetailDto())
    await s.settle()
    await s.open("team")
    const first = s.staffRead()
    expect(first.request.params.get("pagina")).toBe("0")
    expect(first.request.params.get("tamanio")).toBe("20")
    first.flush(staffPageDto([23], 0, 1, 2))
    await s.settle()
    await s.selectStaff("Personal 23")
    await s.click("Agregar al borrador", s.dialog()!)
    await s.fill("order-team-role-23", "APOYO")
    await s.click("Personal siguiente", s.dialog()!)
    const second = s.staffRead()
    expect(second.request.params.get("pagina")).toBe("1")
    expect(second.request.params.get("tamanio")).toBe("1")
    second.flush(staffPageDto([24], 1, 1, 2))
    await s.settle()
    expect(s.dialog()!.textContent).toContain("Personal 23")
    await s.fill("order-team-confirm", true)
    await s.submit()
    const put = s.put("team")
    expect(put.request.body).toEqual({
      asignaciones: [
        { idPersonal: 21, rol: "RESPONSABLE" },
        { idPersonal: 23, rol: "APOYO" }
      ]
    })
    put.flush(manualDetailDto().orden)
    s.read().flush(manualDetailDto())
    await s.settle()
    s.http.expectNone(r => /personal\/\d+/.test(r.url))
  })
  it("blocks duplicate IDs and requires exactly one explicit responsible", async () => {
    const s = await loaded("team")
    await s.selectStaff("Personal 23")
    await s.click("Agregar al borrador", s.dialog()!)
    await s.fill("order-team-role-23", "RESPONSABLE")
    await s.fill("order-team-confirm", true)
    await s.submit()
    s.http.expectNone(r => r.method === "PUT")
    await s.fill("order-team-role-23", "APOYO")
    await s.selectStaff("Personal 23")
    await s.click("Agregar al borrador", s.dialog()!)
    expect(s.dialog()!.querySelectorAll("#order-team-role-23")).toHaveLength(1)
    await s.fill("order-team-confirm", true)
    await s.submit()
    const put = s.put("team")
    expect(put.request.body.asignaciones).toHaveLength(2)
    put.flush(manualDetailDto().orden)
    s.read().flush(manualDetailDto())
    await s.settle()
  })
  it("rejects expired changed staff choices until explicit revalidation, preserving the draft", async () => {
    const s = await loaded("team")
    await s.selectStaff("Personal 23")
    await s.click("Agregar al borrador", s.dialog()!)
    await s.fill("order-team-role-23", "APOYO")
    const now = Date.now()
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 120001)
    await s.fill("order-team-confirm", true)
    await s.submit()
    s.http.expectNone(r => r.method === "PUT")
    expect(s.dialog()!.textContent).toContain("Revalida el personal")
    expect(s.dialog()!.textContent).toContain("Personal 23")
    await s.openStaffSearch()
    s.staffRead().flush(staffPageDto())
    await s.settle()
    await s.submit()
    const put = s.put("team")
    expect(put.request.body.asignaciones[1]).toEqual({ idPersonal: 23, rol: "APOYO" })
    put.flush(manualDetailDto().orden)
    s.read().flush(manualDetailDto())
    await s.settle()
    clock.mockRestore()
  })
  it("caps the draft at twenty unique staff and retains the captured existing assignment", async () => {
    const s = await setupManual(),
      dto = manualDetailDto()
    dto.orden.asignados = Array.from({ length: 20 }, (_, index) => ({
      idPersonal: index + 1,
      nombre: `Integrante ${index + 1}`,
      telefono: null,
      rol: index === 0 ? "RESPONSABLE" : "APOYO"
    }))
    s.read().flush(dto)
    await s.settle()
    await s.open("team")
    s.staffRead().flush(staffPageDto())
    await s.settle()
    await s.selectStaff("Personal 23")
    await s.click("Agregar al borrador", s.dialog()!)
    expect(s.dialog()!.querySelectorAll('select[id^="order-team-role-"]')).toHaveLength(20)
    await s.fill("order-team-confirm", true)
    await s.submit()
    const put = s.put("team")
    expect(put.request.body.asignaciones).toHaveLength(20)
    expect(
      put.request.body.asignaciones.some((item: { idPersonal: number }) => item.idPersonal === 23)
    ).toBe(false)
    put.flush(manualDetailDto().orden)
    s.read().flush(manualDetailDto())
    await s.settle()
  })
  for (const kind of ["schedule", "team"] as const) {
    const ready = async () => {
      const s = await loaded(kind)
      if (kind === "team") await s.fill("order-team-confirm", true)
      return s
    }
    it(`${kind}: blocks duplicate submit/Cancel/Escape/outside while pending`, async () => {
      const s = await ready()
      await s.submit()
      const put = s.put(kind)
      await s.submit()
      s.http.expectNone(r => r.method === "PUT")
      expect(s.button("Cancelar", s.dialog()!)!.disabled).toBe(true)
      s.overlay().hostElement.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      )
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await s.settle()
      expect(s.dialog()).not.toBeNull()
      expect(s.success).not.toHaveBeenCalled()
      put.flush({}, { status: 403, statusText: "Forbidden" })
      await s.settle()
      expect(s.dialog()!.textContent).toContain("No tienes permiso")
      expect(s.button("Cancelar", s.dialog()!)!.disabled).toBe(false)
      await s.click("Cancelar", s.dialog()!)
      expect(s.dialog()).toBeNull()
      expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
    })
    it(`${kind}: same-ID query navigation and renewal preserve pending work; owner change cancels`, async () => {
      const s = await ready(),
        before = s.dialog()
      await s.submit()
      const put = s.put(kind)
      await s.navigate("/admin/operations/orders/17?page=2&size=5")
      s.session.next(createCaller())
      await s.settle()
      expect(s.dialog()).toBe(before)
      expect(put.cancelled).toBe(false)
      await s.navigate("/admin/operations/orders/18")
      s.read(18).flush(manualDetailDto(18))
      await s.settle()
      expect(put.cancelled).toBe(true)
      expect(s.dialog()).toBeNull()
      expect(s.success).not.toHaveBeenCalled()
      expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
    })
    it(`${kind}: replacement cancels pending writes and hides stale feedback`, async () => {
      const s = await ready()
      await s.submit()
      const put = s.put(kind)
      s.session.next(createCaller(20))
      await s.settle()
      expect(put.cancelled).toBe(true)
      expect(s.dialog()).toBeNull()
      expect(s.store.writing()).toBe(false)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
    })
    it(`${kind}: confirmed write remains success when revalidation fails; retry performs GET only`, async () => {
      const s = await ready()
      await s.submit()
      const put = s.put(kind)
      put.flush(manualDetailDto().orden)
      s.read().flush({}, { status: 403, statusText: "Forbidden" })
      await s.settle()
      expect(s.success).toHaveBeenCalledTimes(1)
      expect(s.root().textContent).toContain("Cliente suministrado")
      expect(s.root().textContent).toContain("desactualizados")
      await s.click("Reintentar")
      s.read().flush(manualDetailDto())
      await s.settle()
      s.http.expectNone(r => r.method === "PUT")
      expect(s.history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    })
    it(`${kind}: success feedback that replaces the session cannot keep an old closing overlay alive`, async () => {
      const s = await ready()
      s.success.mockImplementationOnce(() => {
        s.session.next(createCaller(20))
      })
      await s.submit()
      const put = s.put(kind)
      put.flush(manualDetailDto().orden)
      const refresh = s.read()
      await s.settle()
      expect(refresh.cancelled).toBe(true)
      expect(s.dialog()).toBeNull()
      expect(s.success).toHaveBeenCalledTimes(1)
      s.http.expectNone(r => r.method === "PUT")
    })
    it(`${kind}: wrong-owner success does not toast or refresh and retains the draft`, async () => {
      const s = await ready()
      await s.submit()
      const put = s.put(kind)
      put.flush({ ...manualDetailDto().orden, idCliente: 9 })
      await s.settle()
      expect(s.dialog()).not.toBeNull()
      expect(s.success).not.toHaveBeenCalled()
      expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
      s.http.expectNone(r => r.method === "GET")
    })
    it(`${kind}: destruction cancels caller work without late confirmation`, async () => {
      const s = await ready()
      await s.submit()
      const put = s.put(kind)
      s.harness.fixture.destroy()
      expect(put.cancelled).toBe(true)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.history.invalidateCustomer).not.toHaveBeenCalled()
    })
  }
  it.each(["server", "guest"] as const)(
    "dispatches no reads/writes/dialog work for %s",
    async mode => {
      const s = await setupManual({ server: mode === "server", guest: mode === "guest" })
      expect(s.button("Programar orden")).toBeUndefined()
      expect(s.button("Reemplazar equipo")).toBeUndefined()
      s.http.expectNone(() => true)
      if (mode === "server") expect(s.authFactory).not.toHaveBeenCalled()
    }
  )
  it("invalid route IDs dispatch no reads or manual actions", async () => {
    const s = await setupManual({ url: "/admin/operations/orders/2147483648" })
    s.http.expectNone(r => r.url.startsWith(orderDetailApi))
    expect(s.button("Programar orden")).toBeUndefined()
    expect(s.button("Reemplazar equipo")).toBeUndefined()
  })
})
