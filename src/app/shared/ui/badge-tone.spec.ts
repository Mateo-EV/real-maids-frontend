import { Component, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { beforeEach, describe, expect, it } from "vitest"

import { badgeTone } from "@/app/shared/ui/badge-tone"
import { BadgeTone } from "@/app/shared/ui/badge-tone.directive"

@Component({
  selector: "app-badge-tone-host",
  imports: [BadgeTone],
  template: `<span [appBadgeTone]="value()" [badgeToneKind]="kind()">Registrada</span>`
})
class BadgeToneHost {
  readonly value = signal<unknown>("registrada")
  readonly kind = signal<"customer-type" | "request-status" | "catalog-name">("request-status")
}

describe("badgeTone", () => {
  it("maps customer types and keeps unknown types neutral", () => {
    expect(badgeTone("residencial", "customer-type")).toBe("blue")
    expect(badgeTone("Comercial", "customer-type")).toBe("amber")
    expect(badgeTone("otro", "customer-type")).toBe("muted")
  })

  it("maps the request status allow-list and neutralizes anything else", () => {
    expect(badgeTone("registrada", "request-status")).toBe("blue")
    expect(badgeTone("atendida", "request-status")).toBe("green")
    expect(badgeTone("cancelada", "request-status")).toBe("coral")
    expect(badgeTone("desconocida", "request-status")).toBe("muted")
  })

  it("maps order status codes regardless of case", () => {
    expect(badgeTone("PENDIENTE", "order-status")).toBe("amber")
    expect(badgeTone("programada", "order-status")).toBe("blue")
    expect(badgeTone("EN_PROCESO", "order-status")).toBe("navy")
    expect(badgeTone("COMPLETADA", "order-status")).toBe("green")
    expect(badgeTone("PAGADO", "order-status")).toBe("teal")
    expect(badgeTone("cancelada", "order-status")).toBe("coral")
    expect(badgeTone("otro", "order-status")).toBe("muted")
  })

  it("gives every catalog name a stable tone and neutralizes missing names", () => {
    expect(badgeTone("Formulario web", "catalog-name")).toBe(
      badgeTone(" formulario web ", "catalog-name")
    )
    expect(badgeTone("Formulario web", "catalog-name")).not.toBe("muted")
    expect(badgeTone("Origen no disponible", "catalog-name")).toBe("muted")
    expect(badgeTone(undefined, "catalog-name")).toBe("muted")
  })

  it("tones boolean state and final flags from either booleans or supplied labels", () => {
    expect(badgeTone(true, "active-state")).toBe("green")
    expect(badgeTone(false, "active-state")).toBe("muted")
    expect(badgeTone("Activo", "active-state")).toBe("green")
    expect(badgeTone("Inactivo", "active-state")).toBe("muted")
    expect(badgeTone("Convertido", "active-state")).toBe("green")
    expect(badgeTone(true, "final-state")).toBe("amber")
    expect(badgeTone("No final", "final-state")).toBe("muted")
  })
})

describe("BadgeTone directive", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BadgeToneHost] })
  })

  it("sets data-badge-tone from the value and kind inputs", () => {
    const fixture = TestBed.createComponent(BadgeToneHost)
    fixture.detectChanges()
    const badge = fixture.nativeElement.querySelector("span") as HTMLElement

    expect(badge.getAttribute("data-badge-tone")).toBe("blue")

    fixture.componentInstance.kind.set("customer-type")
    fixture.componentInstance.value.set("comercial")
    fixture.detectChanges()

    expect(badge.getAttribute("data-badge-tone")).toBe("amber")
  })
})
