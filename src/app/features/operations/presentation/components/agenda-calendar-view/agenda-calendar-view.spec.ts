import { Component, PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { describe, expect, it } from "vitest"
import { AgendaEntry } from "../../../domain/models/operations-read.models"
import { AgendaView } from "../../navigation/agenda-calendar"
import { agendaEntry } from "../../state/agenda.testing"
import { AgendaCalendarView } from "./agenda-calendar-view"

@Component({
  selector: "app-agenda-calendar-host",
  imports: [AgendaCalendarView],
  template: `<app-agenda-calendar-view
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
  /** FullCalendar's own toolbar title, generated from the explicit date, never from `today`. */
  const heading = () =>
    element.querySelector('[role="heading"][aria-level="2"]')?.textContent?.trim() ?? ""
  return { fixture, host: fixture.componentInstance, element, events, heading, settle }
}

// S8: FullCalendar day/week/month rendering of the agenda, with the real order id on each event.
describe("AgendaCalendarView FullCalendar consumer", () => {
  it("renders one event per supplied entry, on the supplied date, without invented fields", async () => {
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
      // The event text is the entry's own date, clocks and staff, never a fabricated value.
      expect(label).toContain("2024-02-29")
      expect(label).toContain("No registrado")
      expect(label).toContain("Personal suministrado · ID 9")
    }
    // Each event keeps the clock the backend supplied for its own order.
    expect(labels.get("22")).toContain("09:00:00")
    expect(labels.get("17")).toContain("08:15:49.123456789")
    const first = events.find(event => event.getAttribute("data-agenda-order-id") === "17")!
    expect(first.textContent).toContain("OS-17")
    expect(first.textContent).toContain("08:15:49.123456789")
    // The explicit date drives the calendar: February 29th is rendered, not the current day.
    expect(s.heading()).toBe("29 de febrero de 2024")
  })

  it("emits the real order id when an event is clicked", async () => {
    const s = await setup()
    s.host.entries.set([agendaEntry(17)])
    await s.settle()
    const event = s.events()[0]
    expect(event).toBeDefined()
    event.click()
    await s.settle()
    expect(s.host.selected).toEqual([17])
  })

  it("renders no events for an empty agenda and no calendar at all for a blank date", async () => {
    const s = await setup()
    expect(s.element.querySelector("full-calendar")).not.toBeNull()
    expect(s.events()).toHaveLength(0)
    s.host.date.set("")
    await s.settle()
    expect(s.element.querySelector("full-calendar")).toBeNull()
    expect(s.events()).toHaveLength(0)
  })

  it.each([
    ["day", "timeGridDay", 3, "29 de febrero de 2024"],
    ["week", "timeGridWeek", 21, "feb–mar 2024"],
    ["month", "dayGridMonth", 42, "febrero de 2024"]
  ] as const)(
    "re-renders the %s view of the explicit date %s",
    async (view, _type, dateCells, heading) => {
      const s = await setup()
      s.host.entries.set([agendaEntry(17)])
      await s.settle()
      s.host.view.set(view)
      await s.settle()
      // `[data-date]` is FullCalendar's rendered day cell; its count is the window of each view.
      expect(s.element.querySelectorAll("[data-date]")).toHaveLength(dateCells)
      expect(s.heading()).toBe(heading)
      // A time grid renders the hour slots; the month grid renders none.
      const slots = s.element.querySelectorAll("[data-time]").length
      expect(slots > 0).toBe(view !== "month")
      // The event survives every view change and keeps its real order id.
      expect(s.events()).toHaveLength(1)
      expect(s.events()[0].getAttribute("data-agenda-order-id")).toBe("17")
    }
  )

  it("exposes no navigation controls: the page's explicit date is the only way to move the window", async () => {
    const s = await setup()
    const labels = Array.from(s.element.querySelectorAll("button")).map(button =>
      button.getAttribute("aria-label")
    )
    // A calendar-only prev/next would show another period with the previous period's data,
    // and a today action would assume the current date: the project forbids both.
    expect(labels).toEqual([])
    expect(labels.some(label => /hoy|today|antes|siguiente/i.test(label ?? ""))).toBe(false)
  })

  it("renders the seven-day window from the selected date, not the Monday-aligned week", async () => {
    const s = await setup()
    // Thursday 2024-02-29: the query covers 02-29..03-06, so the view must start there.
    s.host.date.set("2024-02-29")
    s.host.view.set("week")
    await s.settle()
    const columns = Array.from(s.element.querySelectorAll<HTMLElement>("[data-date]"))
      .map(cell => cell.getAttribute("data-date"))
      .filter((date): date is string => !!date)
    expect(columns.length).toBeGreaterThan(0)
    expect(columns.length % 7).toBe(0)
    expect(s.element.querySelector('[data-date="2024-02-29"]')).not.toBeNull()
  })

  it("does not construct the calendar on the server", async () => {
    const s = await setup("server")
    s.host.entries.set([agendaEntry(17)])
    await s.settle()
    expect(s.element.querySelector("full-calendar")).toBeNull()
    expect(s.element.textContent?.trim()).toBe("")
    expect(s.events()).toHaveLength(0)
  })
})
