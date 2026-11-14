import { TestBed } from "@angular/core/testing"
import { describe, expect, it, vi } from "vitest"
import { CatalogCombobox } from "./catalog-combobox"

async function setup(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(CatalogCombobox)
  for (const [key, value] of Object.entries({
    id: "customer-choice",
    label: "Cliente",
    placeholder: "Elige un cliente",
    emptyLabel: "Sin clientes en esta página",
    searchPlaceholder: "Buscar nombre…",
    options: [
      { value: "007", label: "Ana" },
      { value: "42", label: "Bea" }
    ],
    ...inputs
  }))
    fixture.componentRef.setInput(key, value)
  fixture.detectChanges()
  const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>("button")!
  async function settle() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  async function open() {
    trigger.click()
    await settle()
    return document.querySelector<HTMLElement>("hlm-combobox-content")!
  }
  return { fixture, trigger, open, settle }
}

describe("CatalogCombobox presentation", () => {
  it("renders the placeholder or supplied selection, including a selection absent from this page", async () => {
    const { fixture, trigger, settle } = await setup()
    expect(trigger.textContent).toContain("Elige un cliente")
    expect(trigger.getAttribute("aria-label")).toBe("Cliente")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    fixture.componentRef.setInput("selectedLabel", "Cliente de otra página")
    fixture.componentRef.setInput("options", [])
    await settle()
    expect(trigger.textContent).toContain("Cliente de otra página")
  })

  it("opens and closes on click and Escape, returning focus to the trigger", async () => {
    const { trigger, open, settle } = await setup()
    await open()
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    trigger.click()
    await settle()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    await open()
    const search = document.querySelector<HTMLInputElement>('input[type="search"]')!
    search.focus()
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await settle()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(document.activeElement).toBe(trigger)
  })

  it("places an independently labelled search immediately before the reload icon button", async () => {
    const { open } = await setup()
    const panel = await open()
    const search = panel.querySelector<HTMLInputElement>('input[type="search"]')!
    expect(search.id).toBe("customer-choice-search")
    expect(search.placeholder).toBe("Buscar nombre…")
    expect(search.getAttribute("aria-label")).toBe("Cliente")
    const reload = search.nextElementSibling!
    expect(reload.tagName).toBe("BUTTON")
    expect(reload.getAttribute("aria-label")).toBe("Recargar opciones")
    expect(reload.querySelector('ng-icon[name="lucideRefreshCw"]')).not.toBeNull()
  })

  it("emits raw search and reload without selecting or filtering supplied options", async () => {
    const { fixture, trigger, open, settle } = await setup({ selectedLabel: "Ana" })
    const searches = vi.fn(),
      selections = vi.fn(),
      reloads = vi.fn()
    fixture.componentInstance.searchChange.subscribe(searches)
    fixture.componentInstance.selectChange.subscribe(selections)
    fixture.componentInstance.reload.subscribe(reloads)
    const panel = await open()
    const search = panel.querySelector<HTMLInputElement>('input[type="search"]')!
    search.value = "  unmatched  "
    search.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
    expect(searches.mock.calls).toEqual([["  unmatched  "]])
    expect(panel.querySelectorAll('[role="option"]').length).toBe(2)
    ;(search.nextElementSibling as HTMLButtonElement).click()
    await settle()
    // `output()` always forwards one argument, so the count is the observable contract here.
    expect(reloads).toHaveBeenCalledOnce()
    expect(selections).not.toHaveBeenCalled()
    expect(trigger.textContent).toContain("Ana")
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
  })

  it("marks the selected option and emits the exact clicked value", async () => {
    const { fixture, open, settle } = await setup({ selectedLabel: "Ana" })
    const selected = vi.fn()
    fixture.componentInstance.selectChange.subscribe(selected)
    const panel = await open()
    expect(panel.querySelector('[role="listbox"]')).not.toBeNull()
    const options = panel.querySelectorAll<HTMLElement>('[role="option"]')
    expect(options[0].getAttribute("aria-selected")).toBe("true")
    expect(options[1].getAttribute("aria-selected")).toBe("false")
    options[0].scrollIntoView = vi.fn()
    options[0].click()
    await settle()
    expect(selected.mock.calls).toEqual([["007"]])
  })

  it("emits a single selection when the clicked option is not the current one", async () => {
    const { fixture, open, settle } = await setup({ selectedLabel: "Ana" })
    const selected = vi.fn()
    fixture.componentInstance.selectChange.subscribe(selected)
    const panel = await open()
    const options = panel.querySelectorAll<HTMLElement>('[role="option"]')
    options.forEach(option => (option.scrollIntoView = vi.fn()))
    options[1].click()
    await settle()
    expect(selected.mock.calls).toEqual([["42"]])
  })

  it("supports keyboard option navigation and selection from search", async () => {
    const { fixture, open, settle } = await setup()
    const selected = vi.fn()
    fixture.componentInstance.selectChange.subscribe(selected)
    const panel = await open()
    panel
      .querySelectorAll<HTMLElement>('[role="option"]')
      .forEach(option => (option.scrollIntoView = vi.fn()))
    const search = panel.querySelector<HTMLInputElement>('input[type="search"]')!
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", keyCode: 40, bubbles: true })
    )
    await settle()
    expect(search.getAttribute("aria-activedescendant")).toBeTruthy()
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await settle()
    expect(selected.mock.calls).toEqual([["007"]])
  })

  it("renders loading, error and empty feedback without presenting a false empty while loading or failed", async () => {
    const { fixture, open, settle } = await setup({ options: [], loading: true })
    const panel = await open()
    expect(panel.querySelector('[role="status"]')?.textContent).toContain("Cargando opciones")
    expect(panel.textContent).not.toContain("Sin clientes en esta página")
    fixture.componentRef.setInput("loading", false)
    fixture.componentRef.setInput("errorLabel", "No se pudieron consultar los clientes")
    await settle()
    expect(panel.querySelector('[role="alert"]')?.textContent).toContain(
      "No se pudieron consultar los clientes"
    )
    expect(panel.textContent).not.toContain("Sin clientes en esta página")
    fixture.componentRef.setInput("errorLabel", "")
    await settle()
    expect(panel.textContent).toContain("Sin clientes en esta página")
  })

  it("omits paging unless supplied and keeps bounded paging inside the panel", async () => {
    const { fixture, open, settle } = await setup()
    const changes = vi.fn()
    fixture.componentInstance.pageChange.subscribe(changes)
    const panel = await open()
    expect(panel.textContent).not.toContain("Anterior")
    fixture.componentRef.setInput("pageCount", 3)
    fixture.componentRef.setInput("page", 1)
    await settle()
    const button = (text: string) =>
      Array.from(panel.querySelectorAll("button")).find(item => item.textContent?.trim() === text)!
    expect(panel.textContent).toContain("Página 1 de 3")
    expect(button("Anterior").disabled).toBe(true)
    button("Anterior").click()
    button("Siguiente").click()
    expect(changes.mock.calls).toEqual([[2]])
    fixture.componentRef.setInput("page", 3)
    await settle()
    expect(button("Siguiente").disabled).toBe(true)
    button("Siguiente").click()
    button("Anterior").click()
    expect(changes.mock.calls).toEqual([[2], [2]])
    fixture.componentRef.setInput("pageCount", 1)
    fixture.componentRef.setInput("page", 1)
    await settle()
    expect(button("Anterior").disabled).toBe(true)
    expect(button("Siguiente").disabled).toBe(true)
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain("Anterior")
  })
})
