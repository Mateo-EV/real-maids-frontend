import { describe, expect, it } from "vitest"
import {
  agendaQuery,
  agendaRange,
  agendaStaffId,
  agendaWeekWindow,
  civilToday,
  validAgendaQuery
} from "./agenda-calendar"

// T7C / S1,S2,S3,S4,S6,S8,S9,S10: civil dates; the page seeds the browser's own day and the
// week window is the Monday→Sunday week that contains it.
describe("Agenda civil-calendar windows", () => {
  it("uses exactly the selected day", () => {
    expect(agendaRange("2024-02-29", "day")).toEqual({
      from: "2024-02-29",
      until: "2024-02-29",
      dates: ["2024-02-29"]
    })
  })
  it.each([
    // Thursday → the week runs Monday 02-26 to Sunday 03-03 across a leap-day month boundary.
    ["2024-02-29", "2024-02-26", "2024-03-03"],
    // Sunday is the last day of its own week, not the first day of the next one.
    ["2024-03-03", "2024-02-26", "2024-03-03"],
    // Monday opens a new week.
    ["2024-03-04", "2024-03-04", "2024-03-10"],
    // A Monday week that crosses the civil year.
    ["2025-12-29", "2025-12-29", "2026-01-04"]
  ])("aligns the Monday→Sunday week of %s", (selected, from, until) => {
    const result = agendaRange(selected, "week")!
    expect(result.from).toBe(from)
    expect(result.until).toBe(until)
    expect(result.dates).toHaveLength(7)
    expect(result.dates[0]).toBe(from)
    expect(result.dates[6]).toBe(until)
  })
  it("derives the same Monday→Sunday window the calendar draws", () => {
    expect(agendaWeekWindow("2024-02-29")).toEqual({ from: "2024-02-26", until: "2024-03-03" })
    expect(agendaWeekWindow("")).toBeUndefined()
    expect(agendaWeekWindow("2024-02-31")).toBeUndefined()
  })
  it.each([
    ["2024-02-29", "2024-02-01", "2024-02-29", 29],
    ["2100-02-12", "2100-02-01", "2100-02-28", 28],
    ["2000-02-12", "2000-02-01", "2000-02-29", 29],
    ["2025-12-31", "2025-12-01", "2025-12-31", 31]
  ] as const)("uses the entire civil month of %s", (selected, from, until, length) => {
    const result = agendaRange(selected, "month")!
    expect(result.from).toBe(from)
    expect(result.until).toBe(until)
    expect(result.dates).toHaveLength(length)
  })
  it.each([
    "",
    "2025-02-29",
    "2100-02-29",
    "2024-04-31",
    "2024-00-01",
    "2024-13-01",
    "2024-01-00",
    "2024-1-01",
    "0000-01-01",
    "2024-01-01T00:00:00Z"
  ])("rejects invalid or non-explicit date %s", selected => {
    expect(agendaRange(selected, "day")).toBeUndefined()
    expect(agendaQuery(selected, "day", "")).toBeUndefined()
  })
  it("rejects a week window beyond four-digit years", () =>
    expect(agendaRange("9999-12-31", "week")).toBeUndefined())
  it.each(["0", "-1", "1.5", "1e2", " 9", "09", "2147483648", "abc"])(
    "rejects invalid explicit staff ID %s",
    staff => {
      expect(agendaStaffId(staff)).toBeUndefined()
      expect(agendaQuery("2024-02-29", "day", staff)).toBeUndefined()
    }
  )
  it("omits blank optional staff and captures positive int32 explicitly", () => {
    expect(agendaQuery("2024-02-29", "day", "")).toEqual({
      from: "2024-02-29",
      until: "2024-02-29"
    })
    expect(agendaQuery("2024-02-29", "day", "2147483647")).toEqual({
      from: "2024-02-29",
      until: "2024-02-29",
      staffId: 2147483647
    })
  })
  // The page seeds only the initial reference date; the window itself stays a civil calculation.
  it.each([
    [new Date(2024, 1, 29, 23, 59), "2024-02-29"],
    [new Date(2024, 0, 5, 0, 0), "2024-01-05"],
    [new Date(2024, 11, 31, 12, 0), "2024-12-31"]
  ])("reads the browser's own civil day of %s as %s", (clock, expected) => {
    expect(civilToday(clock)).toBe(expected)
  })
  it("returns no civil day outside the four-digit year range", () => {
    const far = new Date(0)
    far.setFullYear(10000, 0, 1)
    expect(civilToday(far)).toBe("")
  })
  it("bounds finite input to 62 inclusive dates", () => {
    expect(validAgendaQuery({ from: "2024-01-01", until: "2024-03-02" })).toBe(true)
    expect(validAgendaQuery({ from: "2024-01-01", until: "2024-03-03" })).toBe(false)
    expect(validAgendaQuery({ from: "2024-03-01", until: "2024-02-29" })).toBe(false)
  })
})
