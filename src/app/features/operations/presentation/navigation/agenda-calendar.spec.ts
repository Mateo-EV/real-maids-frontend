import { describe, expect, it } from "vitest"
import { agendaQuery, agendaRange, agendaStaffId, validAgendaQuery } from "./agenda-calendar"

// T7C / S1,S2,S3,S4,S6,S8,S9,S10: explicit civil dates, never browser today.
describe("Agenda civil-calendar windows", () => {
  it("uses exactly the selected day", () => {
    expect(agendaRange("2024-02-29", "day")).toEqual({
      from: "2024-02-29",
      until: "2024-02-29",
      dates: ["2024-02-29"]
    })
  })
  it("starts seven inclusive dates at the selected day across leap/month boundaries", () => {
    expect(agendaRange("2024-02-27", "week")).toEqual({
      from: "2024-02-27",
      until: "2024-03-04",
      dates: [
        "2024-02-27",
        "2024-02-28",
        "2024-02-29",
        "2024-03-01",
        "2024-03-02",
        "2024-03-03",
        "2024-03-04"
      ]
    })
  })
  it("crosses the civil year without choosing a Monday or timezone", () => {
    const result = agendaRange("2025-12-29", "week")!
    expect(result.from).toBe("2025-12-29")
    expect(result.until).toBe("2026-01-04")
    expect(result.dates).toHaveLength(7)
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
  it("rejects a seven-day window beyond four-digit years", () =>
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
  it("bounds finite input to 62 inclusive dates", () => {
    expect(validAgendaQuery({ from: "2024-01-01", until: "2024-03-02" })).toBe(true)
    expect(validAgendaQuery({ from: "2024-01-01", until: "2024-03-03" })).toBe(false)
    expect(validAgendaQuery({ from: "2024-03-01", until: "2024-02-29" })).toBe(false)
  })
})
