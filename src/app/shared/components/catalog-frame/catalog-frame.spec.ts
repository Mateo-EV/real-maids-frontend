import { Component, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CatalogFrame } from "./catalog-frame"

@Component({
  imports: [CatalogFrame],
  template: `<app-catalog-frame
    titleId="catalog-title"
    title="Catálogo"
    description="Contexto"
    [busy]="busy()"
  >
    <button catalogControls (click)="clicks = clicks + 1">Crear</button>
    <p data-body>Registros</p>
    <span catalogFooter>1–5</span>
  </app-catalog-frame>`
})
class Consumer {
  readonly busy = signal(true)
  clicks = 0
}

describe("CatalogFrame presentation contract", () => {
  it("projects live controls/body/footer and owns the labeled busy section and title hierarchy", () => {
    const fixture = TestBed.createComponent(Consumer)
    fixture.detectChanges()
    const root = fixture.nativeElement as HTMLElement
    const section = root.querySelector('section[aria-labelledby="catalog-title"]')!
    expect(section.getAttribute("aria-busy")).toBe("true")
    expect(
      section.querySelector("header h1#catalog-title")?.textContent?.replace(/\s+/g, " ").trim()
    ).toBe("Catálogo")
    expect(section.querySelector("header p")?.textContent).toBe("Contexto")
    expect(section.querySelector("[data-body]")?.textContent).toBe("Registros")
    expect(section.querySelector("footer [catalogFooter]")?.textContent).toBe("1–5")
    section.querySelector<HTMLButtonElement>("header button")!.click()
    expect(fixture.componentInstance.clicks).toBe(1)
    fixture.componentInstance.busy.set(false)
    fixture.detectChanges()
    expect(section.getAttribute("aria-busy")).toBe("false")
  })

  it("centralizes compact table rhythm and a container-width switch, not viewport classes", () => {
    const css = readFileSync("src/styles.css", "utf8")
    expect(css).toContain("app-catalog-frame [hlmTable]")
    expect(css).toMatch(/@container \(width >= 64rem\)/)
    expect(css).toMatch(/app-catalog-frame \[catalogDesktop\]\s*\{\s*display: none/)
    expect(css).toMatch(/app-catalog-frame \[catalogMobile\]\s*\{\s*display: flex/)
    const fixture = TestBed.createComponent(Consumer)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector("app-catalog-frame").style.containerType).toBe(
      "inline-size"
    )
  })
})
