import { Component, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { describe, expect, it } from "vitest"
import { CatalogFilterDate, CatalogFilterSelect, CatalogFilters } from "./catalog-filters"

@Component({
  imports: [CatalogFilters],
  template: `<app-catalog-filters
    catalogControls
    searchInputId="record-search"
    searchLabel="Buscar nombre o correo"
    searchPlaceholder="Buscar nombre o correo…"
    [searchValue]="search()"
    [selects]="selects()"
    (searchChange)="searches.push($event)"
    (selectChange)="changes.push($event)"
  >
    <button type="button">Crear registro</button>
  </app-catalog-filters>`
})
class Consumer {
  readonly search = signal("")
  readonly selects = signal<readonly CatalogFilterSelect[]>([
    {
      id: "record-filter-type",
      label: "Tipo de registro",
      allLabel: "Todos los tipos",
      value: "",
      options: [
        { value: "residencial", label: "Residencial" },
        { value: "comercial", label: "Comercial" }
      ]
    },
    {
      id: "record-filter-state",
      label: "Estado",
      allLabel: "Todos los estados",
      value: "convertido",
      options: [{ value: "convertido", label: "Convertido" }]
    }
  ])
  readonly searches: string[] = []
  readonly changes: { id: string; value: string }[] = []
}

function setup() {
  const fixture = TestBed.createComponent(Consumer)
  fixture.detectChanges()
  const root = fixture.nativeElement as HTMLElement
  const row = root.querySelector("app-catalog-filters") as HTMLElement
  return { fixture, row, consumer: fixture.componentInstance }
}

describe("CatalogFilters presentation contract", () => {
  it("is the filter row host so the shared row CSS keeps direct children", () => {
    const { row } = setup()
    for (const name of ["catalog-filter-row", "flex", "min-w-0", "flex-wrap", "items-end", "gap-2"])
      expect(row.classList.contains(name), name).toBe(true)
    const search = row.querySelector<HTMLElement>(".catalog-filter-search")!
    expect(search.parentElement).toBe(row)
    const wrappers = Array.from(row.children).filter(child => child.tagName === "DIV")
    expect(wrappers.length).toBe(3)
    expect(wrappers[0]).toBe(search)
    const button = row.querySelector("button")!
    expect(button.parentElement).toBe(row)
  })

  it("derives inner ids, labels and placeholders from its inputs", () => {
    const { fixture, row } = setup()
    fixture.detectChanges()
    const search = row.querySelector<HTMLInputElement>('input[type="search"]')!
    expect(search.id).toBe("record-search")
    expect(search.placeholder).toBe("Buscar nombre o correo…")
    expect(row.querySelector('label[for="record-search"]')?.textContent).toBe(
      "Buscar nombre o correo"
    )
    const labels = Array.from(row.querySelectorAll("label")).map(label => [
      label.getAttribute("for"),
      label.textContent
    ])
    expect(labels).toEqual([
      ["record-search", "Buscar nombre o correo"],
      ["record-filter-type", "Tipo de registro"],
      ["record-filter-state", "Estado"]
    ])
    const selects = Array.from(row.querySelectorAll<HTMLSelectElement>("select"))
    expect(selects.map(select => select.id)).toEqual(["record-filter-type", "record-filter-state"])
    expect(selects[1].value).toBe("convertido")
  })

  it("renders the all option first and the supplied options in order", () => {
    const { row } = setup()
    const [type, state] = Array.from(row.querySelectorAll<HTMLSelectElement>("select"))
    const options = (select: HTMLSelectElement) =>
      Array.from(select.options).map(option => [option.value, option.textContent?.trim()])
    expect(options(type)).toEqual([
      ["", "Todos los tipos"],
      ["residencial", "Residencial"],
      ["comercial", "Comercial"]
    ])
    expect(options(state)).toEqual([
      ["", "Todos los estados"],
      ["convertido", "Convertido"]
    ])
  })

  it("emits the raw search value and the exact select payloads", async () => {
    const { fixture, row, consumer } = setup()
    const search = row.querySelector<HTMLInputElement>('input[type="search"]')!
    search.value = "  Ana  "
    search.dispatchEvent(new Event("input", { bubbles: true }))
    expect(consumer.searches).toEqual(["  Ana  "])
    const type = row.querySelector<HTMLSelectElement>("select#record-filter-type")!
    type.value = "comercial"
    type.dispatchEvent(new Event("change", { bubbles: true }))
    expect(consumer.changes).toEqual([{ id: "record-filter-type", value: "comercial" }])
    type.value = ""
    type.dispatchEvent(new Event("change", { bubbles: true }))
    expect(consumer.changes).toEqual([
      { id: "record-filter-type", value: "comercial" },
      { id: "record-filter-type", value: "" }
    ])
    consumer.search.set("reflejado")
    await fixture.whenStable()
    fixture.detectChanges()
    expect(row.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe("reflejado")
  })
})

@Component({
  imports: [CatalogFilters],
  template: `<app-catalog-filters
    catalogControls
    [selects]="selects()"
    [dates]="dates()"
    (selectChange)="changes.push($event)"
    (dateChange)="dateChanges.push($event)"
  />`
})
class DateConsumer {
  readonly selects = signal<readonly CatalogFilterSelect[]>([
    {
      id: "record-filter-state",
      label: "Estado",
      allLabel: "Todos los estados",
      value: "",
      options: [{ value: "pendiente", label: "Pendiente" }]
    }
  ])
  readonly dates = signal<readonly CatalogFilterDate[]>([
    { id: "record-filter-from", label: "Desde", value: "2024-01-31" },
    { id: "record-filter-until", label: "Hasta", value: "" }
  ])
  readonly changes: { id: string; value: string }[] = []
  readonly dateChanges: { id: string; value: string }[] = []
}

describe("CatalogFilters optional date range", () => {
  function setupDates() {
    const fixture = TestBed.createComponent(DateConsumer)
    fixture.detectChanges()
    const row = (fixture.nativeElement as HTMLElement).querySelector(
      "app-catalog-filters"
    ) as HTMLElement
    return { fixture, row, consumer: fixture.componentInstance }
  }

  it("omits the search block entirely when no search input id is supplied", () => {
    const { row } = setupDates()
    expect(row.querySelector('input[type="search"]')).toBeNull()
    expect(row.querySelector(".catalog-filter-search")).toBeNull()
    expect(row.querySelectorAll("select").length).toBe(1)
  })

  it("renders one native date input per supplied date as a direct child of the row", () => {
    const { row } = setupDates()
    const dates = Array.from(row.querySelectorAll<HTMLInputElement>('input[type="date"]'))
    expect(dates.map(input => input.id)).toEqual(["record-filter-from", "record-filter-until"])
    expect(dates[0].value).toBe("2024-01-31")
    expect(dates[1].value).toBe("")
    const labels = dates.map(input =>
      row.querySelector(`label[for="${input.id}"]`)?.textContent?.trim()
    )
    expect(labels).toEqual(["Desde", "Hasta"])
    for (const input of dates)
      expect(input.closest("app-catalog-filters")?.children).toContain(
        input.closest(".catalog-filter-date")
      )
  })

  it("emits the exact date payload and clears it back to an empty string", () => {
    const { row, consumer } = setupDates()
    const from = row.querySelector<HTMLInputElement>("input#record-filter-from")!
    from.value = "2024-02-15"
    from.dispatchEvent(new Event("input", { bubbles: true }))
    from.value = ""
    from.dispatchEvent(new Event("input", { bubbles: true }))
    expect(consumer.dateChanges).toEqual([
      { id: "record-filter-from", value: "2024-02-15" },
      { id: "record-filter-from", value: "" }
    ])
  })
})
