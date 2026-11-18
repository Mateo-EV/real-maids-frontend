import { PLATFORM_ID, Component, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { describe, expect, it } from "vitest"
import { AgendaEntry } from "../../../domain/models/operations-read.models"
import { AgendaView } from "../../navigation/agenda-calendar"
import { agendaEntry } from "../../state/agenda.testing"
import { AgendaBoard } from "./agenda-board"

@Component({
  selector: "app-agenda-board-host",
  imports: [AgendaBoard],
  template: `<app-agenda-board
    [entries]="entries()"
    [selectedDate]="date()"
    [view]="view()"
    [busy]="busy()"
    (orderSelected)="selected.push($event)"
  />`
})
class Host {
  readonly entries = signal<readonly AgendaEntry[]>([])
  readonly date = signal("2024-02-29")
  readonly view = signal<AgendaView>("day")
  readonly busy = signal(false)
  readonly selected: number[] = []
}

async function setup(platform: "browser" | "server" = "browser") {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [{ provide: PLATFORM_ID, useValue: platform }]
  })
  const fixture = TestBed.createComponent(Host)
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  await settle()
  const element = fixture.nativeElement as HTMLElement
  const events = () => Array.from(element.querySelectorAll<HTMLElement>("[data-agenda-entry]"))
  const dates = () =>
    Array.from(element.querySelectorAll<HTMLElement>("[data-agenda-date]")).map(cell =>
      cell.getAttribute("data-agenda-date")
    )
  return { fixture, host: fixture.componentInstance, element, events, dates, settle }
}

// S2: own agenda board (spartan tokens, no calendar library) for day, week and month.
describe("AgendaBoard", () => {
  it("renders one card per supplied entry with the real order identity and literal clocks", async () => {
    const s = await setup()
    s.host.entries.set([{ ...agendaEntry(22), startTime: "09:00:00" }, agendaEntry(17)])
    await s.settle()
    const events = s.events()
    expect(events).toHaveLength(2)
    expect(events.map(event => event.getAttribute("data-agenda-order-id")).sort()).toEqual([
      "17",
      "22"
    ])
    const labels = new Map(
      events.map(event => [
        event.getAttribute("data-agenda-order-id"),
        event.getAttribute("aria-label") ?? ""
      ])
    )
    for (const label of labels.values()) {
      // The label carries the supplied projection, including the documented absence.
      expect(label).toContain("2024-02-29")
      expect(label).toContain("No registrado")
      expect(label).toContain("Personal suministrado · ID 9")
      expect(label).toContain("Cliente suministrado")
    }
    expect(labels.get("22")).toContain("09:00:00")
    expect(labels.get("17")).toContain("08:15:49.123456789")
    const first = events.find(event => event.getAttribute("data-agenda-order-id") === "17")!
    expect(first.textContent).toContain("OS-17")
    expect(first.textContent).toContain("08:15:49.123456789")
    // The supplied status is printed, never only encoded as color.
    expect(first.textContent).toContain("PROGRAMADA")
    // The card prints who works the shift and where, taken from the same projection.
    expect(first.textContent).toContain("Personal suministrado")
    expect(first.textContent).toContain("Cliente suministrado")
    expect(first.textContent).toContain("Oficina suministrada")
  })

  it("prints the supplied detail on every card regardless of the view", async () => {
    const s = await setup()
    s.host.entries.set([{ ...agendaEntry(17), serviceTypeName: "Limpieza profunda" }])
    await s.settle()
    const card = () => s.element.querySelector('[data-agenda-order-id="17"]')!
    for (const view of ["day", "week"] as const) {
      s.host.view.set(view)
      await s.settle()
      // Clipping depends on the card's own height: no field is silently dropped by the view.
      expect(card().textContent, view).toContain("Cliente suministrado")
      expect(card().textContent, view).toContain("Oficina suministrada")
      expect(card().textContent, view).toContain("Limpieza profunda")
      expect(card().textContent, view).toContain("Personal suministrado")
    }
    // An assignment the API did not supply is stated as absence, never as a normal value.
    s.host.entries.set([{ ...agendaEntry(17), assignedStaff: [] }])
    await s.settle()
    expect(card().textContent).toContain("Sin personal asignado")
    expect(card().querySelector("[data-unassigned]")).not.toBeNull()
  })

  it("prints the customer and the staff on the compact month chip", async () => {
    const s = await setup()
    s.host.view.set("month")
    s.host.entries.set([agendaEntry(17)])
    await s.settle()
    const chip = s.element.querySelector('[data-agenda-order-id="17"]')!
    expect(chip.textContent).toContain("OS-17")
    expect(chip.textContent).toContain("Cliente suministrado · Personal suministrado")
  })

  it("emits the real order id when a card is clicked", async () => {
    const s = await setup()
    s.host.entries.set([agendaEntry(17)])
    await s.settle()
    s.events()[0].click()
    await s.settle()
    expect(s.host.selected).toEqual([17])
  })

  it("draws the hour axis the shifts occupy, not a fixed business range", async () => {
    const s = await setup()
    s.host.entries.set([
      agendaEntry(17),
      { ...agendaEntry(22), startTime: "14:30", endTime: "16:00" }
    ])
    await s.settle()
    const hours = Array.from(s.element.querySelectorAll<HTMLElement>("[data-agenda-hour]")).map(
      cell => cell.getAttribute("data-agenda-hour")
    )
    expect(hours).toEqual(["8", "9", "10", "11", "12", "13", "14", "15"])
    expect(s.element.querySelector("[data-agenda-hour='8']")?.textContent).toContain("08:00")
  })

  it.each([
    ["day", 1],
    ["week", 7],
    ["month", 29]
  ] as const)("renders the %s window of the explicit date", async (view, cells) => {
    const s = await setup()
    s.host.entries.set([agendaEntry(17)])
    await s.settle()
    s.host.view.set(view)
    await s.settle()
    expect(s.dates()).toHaveLength(cells)
    // A time board draws hour rows; the month table draws none.
    expect(s.element.querySelectorAll("[data-agenda-hour]").length > 0).toBe(view !== "month")
    // The card survives every view change and keeps its real order id.
    expect(s.events()).toHaveLength(1)
    expect(s.events()[0].getAttribute("data-agenda-order-id")).toBe("17")
  })

  it("renders the Monday→Sunday week that contains the selected date", async () => {
    const s = await setup()
    s.host.entries.set([agendaEntry(17)])
    s.host.date.set("2024-02-29")
    s.host.view.set("week")
    await s.settle()
    // Thursday 2024-02-29: the queried week is Monday 02-26 → Sunday 03-03.
    expect(s.dates()).toEqual([
      "2024-02-26",
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
      "2024-03-02",
      "2024-03-03"
    ])
  })

  it("never draws a shift the backend returned outside the consulted window", async () => {
    const s = await setup()
    s.host.entries.set([agendaEntry(17), agendaEntry(22, "2024-03-05")])
    await s.settle()
    expect(s.element.querySelector('[data-agenda-order-id="17"]')).not.toBeNull()
    expect(s.element.querySelector('[data-agenda-order-id="22"]')).toBeNull()
  })

  it("places simultaneous orders in their own lanes", async () => {
    const s = await setup()
    s.host.entries.set([
      { ...agendaEntry(17), startTime: "09:00", endTime: "11:00" },
      { ...agendaEntry(22), startTime: "09:30", endTime: "10:30" }
    ])
    await s.settle()
    const lanes = s
      .events()
      .map(event => [
        event.getAttribute("data-agenda-order-id"),
        event.getAttribute("data-agenda-lane"),
        event.getAttribute("data-agenda-lanes")
      ])
    expect(lanes).toEqual([
      ["17", "0", "2"],
      ["22", "1", "2"]
    ])
  })

  it("keeps a returned shift with no usable clock visible instead of dropping it", async () => {
    const s = await setup()
    s.host.entries.set([{ ...agendaEntry(17), startTime: "sin hora" }])
    await s.settle()
    const card = s.element.querySelector('[data-agenda-order-id="17"]')
    expect(card).not.toBeNull()
    expect(s.element.textContent).toContain("sin horario utilizable")
    expect(s.element.querySelectorAll("[data-agenda-hour]")).toHaveLength(0)
  })

  it("renders nothing for a blank date", async () => {
    const s = await setup()
    s.host.entries.set([agendaEntry(17)])
    await s.settle()
    expect(s.events()).toHaveLength(1)
    s.host.date.set("")
    await s.settle()
    expect(s.element.textContent?.trim()).toBe("")
  })

  it("draws the empty agenda of the queried window instead of a no-results sentence", async () => {
    const s = await setup()
    await s.settle()
    // The window alone decides the structure: a verified empty reading still draws the board.
    const board = s.element.querySelector(".agenda-board")
    expect(board?.getAttribute("data-agenda-empty")).toBe("true")
    expect(s.events()).toHaveLength(0)
    expect(s.dates()).toEqual(["2024-02-29"])
    // No shift, so no derived hour axis is invented for the empty surface.
    expect(s.element.querySelectorAll("[data-agenda-hour]")).toHaveLength(0)
    s.host.view.set("month")
    await s.settle()
    expect(s.events()).toHaveLength(0)
    expect(s.dates()).toHaveLength(29)
    expect(s.element.querySelector(".agenda-board")?.getAttribute("data-agenda-empty")).toBe("true")
  })

  it("does not render on the server", async () => {
    const s = await setup("server")
    s.host.entries.set([agendaEntry(17)])
    await s.settle()
    expect(s.element.textContent?.trim()).toBe("")
    expect(s.events()).toHaveLength(0)
  })

  it("exposes no navigation controls: the page's explicit date is the only way to move the window", async () => {
    const s = await setup()
    s.host.entries.set([agendaEntry(17)])
    await s.settle()
    const buttons = Array.from(s.element.querySelectorAll<HTMLElement>("button"))
    // Every button opens an order; a calendar prev/next would page another period with this data.
    expect(buttons).toHaveLength(1)
    for (const button of buttons) expect(button.hasAttribute("data-agenda-entry")).toBe(true)
    expect(
      Array.from(s.element.querySelectorAll("[aria-label]")).some(node =>
        /hoy|today|antes|siguiente/i.test(node.getAttribute("aria-label") ?? "")
      )
    ).toBe(false)
  })
})
