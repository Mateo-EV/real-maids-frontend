import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { describe, expect, it, vi } from "vitest"
import { TablePagination } from "./table-pagination"

function setup(page = 25, count = 50) {
  TestBed.configureTestingModule({ imports: [TablePagination], providers: [provideRouter([])] })
  const fixture = TestBed.createComponent(TablePagination)
  fixture.componentRef.setInput("currentPage", page)
  fixture.componentRef.setInput("pageCount", count)
  fixture.componentRef.setInput("label", "Paginación de usuarios")
  fixture.detectChanges()
  const element = fixture.nativeElement as HTMLElement
  const emitted = vi.fn()
  fixture.componentInstance.pageSelected.subscribe(emitted)
  const button = (name: string) => element.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
  return { fixture, element, emitted, button }
}

describe("TablePagination", () => {
  it("renders named native navigation, selected page and noninteractive ellipses", () => {
    const { element, button, emitted } = setup()
    expect(element.querySelector('nav[aria-label="Paginación de usuarios"]')).not.toBeNull()
    expect(Array.from(element.querySelectorAll('button[aria-label^="Página "]:not([aria-label="Página anterior"]):not([aria-label="Página siguiente"])')).map(node => node.textContent?.trim()))
      .toEqual(["1", "24", "25", "26", "50"])
    expect(button("Página 25").getAttribute("aria-current")).toBe("page")
    expect(element.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(element.querySelectorAll("a")).toHaveLength(0)
    const ellipses = element.querySelectorAll("hlm-pagination-ellipsis")
    expect(ellipses).toHaveLength(2)
    for (const ellipsis of ellipses) {
      expect(ellipsis.querySelector("button, a, [tabindex]")).toBeNull()
      expect(ellipsis.textContent).toContain("Más páginas")
    }
    button("Página 26").click()
    expect(emitted).toHaveBeenCalledExactlyOnceWith(26)
    expect(button("Página 25").getAttribute("aria-current")).toBe("page")
    expect(element.querySelector("ul")?.classList.contains("flex-wrap")).toBe(true)
  })

  it("emits previous and next selections without owning current-page state", () => {
    const { button, emitted } = setup()
    button("Página anterior").click()
    button("Página siguiente").click()
    expect(emitted.mock.calls).toEqual([[24], [26]])
  })

  it.each([[1, 50], [50, 50], [1, 1]])("disables boundary navigation on page %s of %s", (page, count) => {
    const { button, emitted } = setup(page, count)
    expect(button("Página anterior").disabled).toBe(page === 1)
    expect(button("Página siguiente").disabled).toBe(page === count)
    if (page === 1) button("Página anterior").click()
    if (page === count) button("Página siguiente").click()
    expect(emitted).not.toHaveBeenCalled()
  })

  it("shows all short-list pages and bounds controls for huge counts", () => {
    const { fixture, element } = setup(4, 7)
    expect(element.querySelectorAll("button")).toHaveLength(9)
    expect(element.querySelectorAll("hlm-pagination-ellipsis")).toHaveLength(0)
    fixture.componentRef.setInput("pageCount", Number.MAX_SAFE_INTEGER)
    fixture.componentRef.setInput("currentPage", 1000000)
    fixture.detectChanges()
    expect(element.querySelectorAll("li").length).toBeLessThanOrEqual(9)
    expect(element.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe("1000000")
  })

  it("rejects synthetic selection events at boundaries and while disabled", () => {
    const { fixture, button, emitted } = setup(1, 1)
    button("Página anterior").dispatchEvent(new MouseEvent("click"))
    button("Página siguiente").dispatchEvent(new MouseEvent("click"))
    fixture.componentRef.setInput("disabled", true)
    fixture.detectChanges()
    button("Página 1").dispatchEvent(new MouseEvent("click"))
    expect(emitted).not.toHaveBeenCalled()
  })

  it("disables every selection while pending and updates when inputs change", () => {
    const { fixture, element, button, emitted } = setup()
    fixture.componentRef.setInput("disabled", true)
    fixture.detectChanges()
    for (const control of element.querySelectorAll<HTMLButtonElement>("button")) {
      expect(control.disabled).toBe(true)
      control.click()
    }
    expect(emitted).not.toHaveBeenCalled()
    fixture.componentRef.setInput("disabled", false)
    fixture.componentRef.setInput("currentPage", 50)
    fixture.detectChanges()
    expect(button("Página 50").getAttribute("aria-current")).toBe("page")
    expect(button("Página siguiente").disabled).toBe(true)
    button("Página 49").click()
    expect(emitted).toHaveBeenCalledExactlyOnceWith(49)
  })
})
