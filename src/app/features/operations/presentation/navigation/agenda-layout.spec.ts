import { describe, expect, it } from "vitest"
import { AgendaEntry } from "../../domain/models/operations-read.models"
import { agendaEntry } from "../state/agenda.testing"
import {
  agendaClock,
  agendaEntryLabel,
  agendaHourAxis,
  agendaMonthCells,
  agendaStaffNames,
  agendaStatusTone,
  agendaTimeGrid,
  civilWeekday,
  hourLabel,
  parseClock,
  weekdayShort
} from "./agenda-layout"

const entry = (
  orderId: number,
  clock: Partial<AgendaEntry> = {},
  date = "2024-02-29"
): AgendaEntry => ({
  ...agendaEntry(orderId, date),
  ...clock
})

describe("parseClock", () => {
  it("reads the literal clock texts the API returns", () => {
    expect(parseClock("08:15")).toBe(495)
    expect(parseClock("08:15:49")).toBe(495)
    // Fractional seconds only lose their sub-minute part: the text is never reformatted.
    expect(parseClock("08:15:49.123456789")).toBe(495)
    expect(parseClock("24:00")).toBe(1440)
    expect(parseClock("00:00")).toBe(0)
  })

  it("rejects anything that is not a real clock of the civil day", () => {
    for (const value of [
      "",
      "8:15",
      "24:01",
      "25:00",
      "08:60",
      "08:15:60",
      "08",
      "08:15:49.",
      "x"
    ]) {
      expect(parseClock(value), value).toBeUndefined()
    }
  })
})

describe("agendaClock", () => {
  it("keeps the supplied end and falls back to one hour when it is absent", () => {
    expect(agendaClock(entry(1, { startTime: "08:15", endTime: "10:00" }))).toEqual({
      start: 495,
      end: 600
    })
    expect(agendaClock(entry(1, { startTime: "08:15", endTime: null }))).toEqual({
      start: 495,
      end: 555
    })
  })

  it("never produces an inverted or unusably small box", () => {
    // An end before the start cannot be trusted, so the default hour applies.
    expect(agendaClock(entry(1, { startTime: "10:00", endTime: "09:00" }))).toEqual({
      start: 600,
      end: 660
    })
    expect(agendaClock(entry(1, { startTime: "10:00", endTime: "10:10" }))).toEqual({
      start: 600,
      end: 630
    })
    // The last minutes of the day stay inside it.
    expect(agendaClock(entry(1, { startTime: "23:40", endTime: null }))).toEqual({
      start: 1420,
      end: 1440
    })
    expect(agendaClock(entry(1, { startTime: "no registrado" }))).toBeUndefined()
  })
})

describe("agendaHourAxis", () => {
  it("draws only the band the shifts occupy", () => {
    const axis = agendaHourAxis([
      { start: 495, end: 555 },
      { start: 600, end: 780 }
    ])
    expect(axis).toEqual({ from: 8, until: 13, hours: [8, 9, 10, 11, 12] })
    expect(axis?.hours.map(hourLabel)).toEqual(["08:00", "09:00", "10:00", "11:00", "12:00"])
  })

  it("keeps at least one hour and stays inside the civil day", () => {
    expect(agendaHourAxis([{ start: 0, end: 0 }])).toEqual({ from: 0, until: 1, hours: [0] })
    expect(agendaHourAxis([{ start: 1420, end: 1440 }])?.until).toBe(24)
    expect(agendaHourAxis([])).toBeUndefined()
  })
})

describe("agendaTimeGrid", () => {
  it("places every in-window shift on its own day with the supplied identity", () => {
    const grid = agendaTimeGrid(
      ["2024-02-26", "2024-02-27"],
      [
        entry(17, {}, "2024-02-26"),
        entry(22, { date: "2024-02-27", startTime: "10:00", endTime: "11:00" })
      ]
    )
    const monday = grid.columns[0]
    expect(monday.weekday).toBe("lun")
    expect(monday.dayNumber).toBe("26")
    expect(monday.slots.map(slot => slot.entry.orderId)).toEqual([17])
    expect(grid.columns[1].slots.map(slot => slot.entry.orderId)).toEqual([22])
    // The axis starts at the hour holding the earliest shift, so 08:15 sits 15 minutes in.
    expect(grid.axis).toEqual({ from: 8, until: 11, hours: [8, 9, 10] })
    expect(monday.slots[0].top).toBeCloseTo((15 / 180) * 100, 5)
    expect(grid.columns[1].slots[0].top).toBeCloseTo((120 / 180) * 100, 5)
  })

  it("draws nothing for a shift dated outside the consulted window", () => {
    const grid = agendaTimeGrid(["2024-02-29"], [entry(17), entry(22, {}, "2024-03-05")])
    expect(grid.columns).toHaveLength(1)
    expect(grid.columns[0].slots.map(slot => slot.entry.orderId)).toEqual([17])
    expect(grid.unplaced).toEqual([])
  })

  it("keeps an entry it cannot place visible instead of dropping it", () => {
    const grid = agendaTimeGrid(["2024-02-29"], [entry(17, { startTime: "sin hora" })])
    expect(grid.axis).toBeUndefined()
    expect(grid.columns[0].slots).toEqual([])
    expect(grid.unplaced.map(item => item.orderId)).toEqual([17])
  })

  it("gives every shift of a staggered overlap group the same lane count", () => {
    // 09:00–10:00 only touches the 09:00–11:00 shift, yet the group it belongs to reaches three
    // lanes. Sizing each card from its own neighbours made that first card 50% wide and let the
    // third one cover part of it while both were clickable.
    const staggered = agendaTimeGrid(
      ["2024-02-29"],
      [
        entry(17, { startTime: "09:00", endTime: "10:00" }),
        entry(22, { startTime: "09:00", endTime: "11:00" }),
        entry(33, { startTime: "10:00", endTime: "12:00" }),
        entry(44, { startTime: "10:00", endTime: "11:00" })
      ]
    )
    expect(
      staggered.columns[0].slots.map(slot => [slot.entry.orderId, slot.lane, slot.lanes])
    ).toEqual([
      [22, 0, 3],
      [17, 1, 3],
      [33, 1, 3],
      [44, 2, 3]
    ])
  })

  it("gives simultaneous shifts their own lane and stacks sequential ones", () => {
    const overlapping = agendaTimeGrid(
      ["2024-02-29"],
      [
        entry(17, { startTime: "09:00", endTime: "11:00" }),
        entry(22, { startTime: "09:30", endTime: "10:30" })
      ]
    )
    const [first, second] = overlapping.columns[0].slots
    expect([first.lane, first.lanes]).toEqual([0, 2])
    expect([second.lane, second.lanes]).toEqual([1, 2])

    const sequential = agendaTimeGrid(
      ["2024-02-29"],
      [
        entry(17, { startTime: "09:00", endTime: "10:00" }),
        entry(22, { startTime: "10:00", endTime: "11:00" })
      ]
    )
    expect(sequential.columns[0].slots.map(slot => [slot.lane, slot.lanes])).toEqual([
      [0, 1],
      [0, 1]
    ])
  })
})

describe("agendaMonthCells", () => {
  it("aligns the month Monday-first and pads only the ends", () => {
    const dates = Array.from(
      { length: 29 },
      (_, index) => `2024-02-${String(index + 1).padStart(2, "0")}`
    )
    // 2024-02-01 was a Thursday: three filler cells precede it.
    const cells = agendaMonthCells(dates, [entry(17)])
    expect(cells).toHaveLength(35)
    expect(cells.slice(0, 3).map(cell => cell.date)).toEqual([null, null, null])
    expect(cells[3].date).toBe("2024-02-01")
    expect(cells.at(-1)?.date).toBeNull()
    expect(cells.filter(cell => cell.inMonth)).toHaveLength(29)
    // Three fillers precede the 1st, so the entry of the 29th sits at that offset.
    expect(cells[31].date).toBe("2024-02-29")
    expect(cells[31].entries.map(item => item.orderId)).toEqual([17])
  })

  it("orders the day list by the literal clock and ignores shifts outside the month", () => {
    const dates = ["2024-02-01"]
    const cells = agendaMonthCells(dates, [
      entry(22, { startTime: "15:00" }, "2024-02-01"),
      entry(17, { startTime: "09:00" }, "2024-02-01"),
      entry(23, {}, "2024-03-05")
    ])
    expect(cells[3].date).toBe("2024-02-01")
    expect(cells[3].entries.map(item => item.orderId)).toEqual([17, 22])
  })
})

describe("civil calendar labels", () => {
  it("keeps the queried Monday-first week", () => {
    expect(civilWeekday("2024-02-26")).toBe(0)
    expect(civilWeekday("2024-02-29")).toBe(3)
    expect(civilWeekday("2024-03-03")).toBe(6)
    expect(weekdayShort("2024-02-29")).toBe("jue")
    expect(weekdayShort("no-date")).toBe("")
  })
})

describe("agendaEntryLabel", () => {
  it("carries the whole supplied projection, including the documented absence", () => {
    const label = agendaEntryLabel(entry(17))
    expect(label).toContain("2024-02-29 · OS-17 · Orden ID 17")
    expect(label).toContain("08:15:49.123456789 → No registrado")
    expect(label).toContain("Estado: PROGRAMADA")
    expect(label).toContain("Cliente: Cliente suministrado")
    expect(label).toContain("Personal: Personal suministrado · ID 9 · responsable · No registrado")
    expect(agendaEntryLabel({ ...entry(17), assignedStaff: [] })).toContain("Sin personal asignado")
  })
})

describe("agendaStaffNames", () => {
  it("joins only the supplied staff names and states the documented absence", () => {
    expect(agendaStaffNames(entry(17))).toBe("Personal suministrado")
    expect(
      agendaStaffNames(
        entry(17, {
          assignedStaff: [
            { staffId: 9, name: "Ana", phone: null, role: "responsable" },
            { staffId: 10, name: "   ", phone: null, role: "apoyo" },
            { staffId: 11, name: "Luis", phone: "555", role: "apoyo" }
          ]
        })
      )
    ).toBe("Ana, Luis")
    expect(agendaStaffNames(entry(17, { assignedStaff: [] }))).toBe("Sin personal asignado")
  })
})

describe("agendaStatusTone", () => {
  it("maps the documented order states and stays neutral for anything else", () => {
    expect(agendaStatusTone("PROGRAMADA")).toBe("navy")
    expect(agendaStatusTone("EN_PROCESO")).toBe("amber")
    expect(agendaStatusTone("COMPLETADA")).toBe("green")
    expect(agendaStatusTone("CANCELADA")).toBe("coral")
    expect(agendaStatusTone("OTRO")).toBe("muted")
  })
})
