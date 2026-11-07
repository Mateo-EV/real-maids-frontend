import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { expect } from "vitest"
import {
  setupUpdate,
  origin
} from "../../components/service-request-editor/service-request-update.testing"
import { ServiceOrdersStore } from "../../state/service-orders.store"
import { orderDetailDto } from "../service-order-detail-page/service-order-detail-page.testing"

export {
  caller,
  detailUrl,
  requestDto
} from "../../components/service-request-editor/service-request-update.testing"
export const ordersApi = origin + "/api/ordenes"
export function createdOrderDto(id = 73) {
  const dto = orderDetailDto(id)
  return {
    ...dto,
    orden: {
      ...dto.orden,
      idSolicitud: 17,
      estado: "PENDIENTE",
      estadoNombre: "Pendiente",
      programacion: null,
      asignados: []
    },
    propiedad: { ...dto.propiedad, instruccionesAcceso: null, codigoPuerta: null },
    historial: [],
    programaciones: []
  }
}

export async function setupOrderCreate(options: Parameters<typeof setupUpdate>[0] = {}) {
  const s = await setupUpdate(options)
  const orders = TestBed.inject(ServiceOrdersStore)
  const dialog = () => document.querySelector<HTMLElement>("app-service-order-create-dialog")
  const button = (label: string, root: ParentNode = s.root()) =>
    [...root.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label
    )
  const click = async (label: string, root: ParentNode = s.root()) => {
    const control = button(label, root)
    expect(control, label).toBeDefined()
    expect(control!.disabled, label).toBe(false)
    control!.click()
    await s.settle()
  }
  const open = async () => {
    await click("Crear orden")
    expect(dialog()).not.toBeNull()
  }
  const field = (name: "amount" | "observation") => {
    const control = dialog()!.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `#order-create-${name}`
    )
    expect(control, name).not.toBeNull()
    return control!
  }
  const fill = async (name: "amount" | "observation", value: string) => {
    const control = field(name)
    control.value = value
    control.dispatchEvent(new Event("input", { bubbles: true }))
    control.dispatchEvent(new Event("blur"))
    await s.settle()
  }
  const submit = async () => {
    const form = dialog()!.querySelector("form")
    expect(form).not.toBeNull()
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await s.settle()
  }
  const post = () => s.http.expectOne(r => r.url === ordersApi && r.method === "POST")
  const overlay = () => getDebugNode(dialog()!)!.injector.get(CdkDialogRef).overlayRef
  const link = () =>
    [...s.root().querySelectorAll<HTMLAnchorElement>("a")].find(
      a => a.textContent?.trim() === "Ver orden creada"
    )
  return { ...s, orders, dialog, button, click, open, field, fill, submit, post, overlay, link }
}
