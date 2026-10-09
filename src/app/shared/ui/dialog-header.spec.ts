import { Component, inject } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { HlmDialogImports, HlmDialogService } from "@spartan-ng/helm/dialog"
import { describe, expect, it } from "vitest"

const title = "Un título de otro módulo que puede ocupar varias líneas"
const description = "Una descripción larga que conserva el contexto y el nombre accesible."

@Component({
  selector: "app-example-modal",
  imports: [HlmDialogImports],
  template: `
    <section hlmDialogHeader>
      <h2 hlmDialogTitle>${title}</h2>
      <p hlmDialogDescription>${description}</p>
    </section>
    <p>Contenido del módulo</p>
    <hlm-dialog-footer><button type="button">Aceptar</button></hlm-dialog-footer>
  `
})
class ExampleModal {}

@Component({
  imports: [HlmDialogImports],
  template: `
    <hlm-dialog>
      <button id="projected" hlmDialogTrigger>Open</button>
      <hlm-dialog-content *hlmDialogPortal>
        <hlm-dialog-header>
          <h2 hlmDialogTitle>${title}</h2>
          <p hlmDialogDescription>${description}</p>
        </hlm-dialog-header>
        <p>Contenido del módulo</p>
        <hlm-dialog-footer><button type="button">Aceptar</button></hlm-dialog-footer>
      </hlm-dialog-content>
    </hlm-dialog>
    <button id="dynamic" (click)="open()">Open dynamic</button>
  `
})
class TestHost {
  private readonly dialogs = inject(HlmDialogService)
  open(): void {
    this.dialogs.open(ExampleModal, { showCloseButton: false })
  }
}

// Structural/semantic coverage only: jsdom cannot certify full-bleed geometry or contrast.
describe("Shared Helm modal header contract", () => {
  it.each(["projected", "dynamic"])(
    "exposes standard slots and unchanged accessible text for a %s modal in another module",
    async mode => {
      TestBed.configureTestingModule({ imports: [TestHost] })
      const fixture = TestBed.createComponent(TestHost)
      fixture.detectChanges()
      fixture.nativeElement.querySelector(`#${mode}`).click()
      await fixture.whenStable()
      fixture.detectChanges()

      const content = document.querySelector<HTMLElement>('[data-slot="dialog-content"]')!
      const host = mode === "dynamic" ? content.querySelector("app-example-modal")! : content
      const header = host.firstElementChild!
      expect(header.getAttribute("data-slot")).toBe("dialog-header")
      const heading = header.querySelector<HTMLElement>('[data-slot="dialog-title"]')!
      const subtitle = header.querySelector<HTMLElement>('[data-slot="dialog-description"]')!
      expect(heading.textContent).toBe(title)
      expect(subtitle.textContent).toBe(description)
      expect(heading.children).toHaveLength(0)
      expect(heading.id).not.toBe("")
      expect(subtitle.id).not.toBe("")
      const dialog = content.closest('[role="dialog"]')!
      expect(dialog.getAttribute("aria-labelledby")).toBe(heading.id)
      expect(dialog.getAttribute("aria-describedby")).toBe(subtitle.id)
      expect(host.querySelector('[data-slot="dialog-footer"]')).not.toBeNull()
      expect(content.querySelector('[data-slot="dialog-close"]') !== null).toBe(mode === "projected")
    }
  )
})
