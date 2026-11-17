import { AgendaQuery } from "../../domain/params/operations.params"

export type AgendaView = "day" | "week" | "month"
export interface AgendaRange {
  from: string
  until: string
  dates: string[]
}

const civilDate = (text: string): Date | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined
  const [year, month, day] = text.split("-").map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) return undefined
  // UTC is used solely as a civil-calendar calculator, not an operational timezone.
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : undefined
}
const text = (date: Date) => date.toISOString().slice(0, 10)
const pad = (value: number) => String(value).padStart(2, "0")

/**
 * The browser's own civil day, used only to seed the initial reference date of the agenda.
 * It is a calendar day, never an operational timezone: the returned text is the day the user
 * is living in, so the seeded window matches the shifts the backend stores as literal dates.
 */
export function civilToday(clock: Date = new Date()): string {
  const year = clock.getFullYear()
  if (!Number.isInteger(year) || year < 1 || year > 9999) return ""
  return `${String(year).padStart(4, "0")}-${pad(clock.getMonth() + 1)}-${pad(clock.getDate())}`
}

/**
 * The Monday→Sunday civil week that contains `selected`, matching the calendar's `firstDay: 1`.
 * `getUTCDay()` is Sunday-first, so it is rotated to Monday-first before aligning.
 */
export function agendaWeekWindow(selected: string): { from: string; until: string } | undefined {
  const date = civilDate(selected)
  if (!date) return undefined
  const monday = new Date(date)
  monday.setUTCDate(monday.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setUTCDate(sunday.getUTCDate() + 6)
  if (monday.getUTCFullYear() < 1 || sunday.getUTCFullYear() > 9999) return undefined
  return { from: text(monday), until: text(sunday) }
}

export function agendaRange(selected: string, view: AgendaView): AgendaRange | undefined {
  const date = civilDate(selected)
  if (!date || !["day", "week", "month"].includes(view)) return undefined
  let first = new Date(date)
  let last = new Date(date)
  if (view === "week") {
    const week = agendaWeekWindow(selected)
    if (!week) return undefined
    first = civilDate(week.from)!
    last = civilDate(week.until)!
  }
  if (view === "month") {
    first.setUTCDate(1)
    last.setUTCMonth(last.getUTCMonth() + 1, 0)
  }
  if (last.getUTCFullYear() > 9999) return undefined
  const dates: string[] = []
  for (const cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1))
    dates.push(text(cursor))
  return { from: text(first), until: text(last), dates }
}

export function agendaStaffId(value: string): number | undefined {
  return /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647 ? Number(value) : undefined
}

export function agendaQuery(
  selected: string,
  view: AgendaView,
  staff: string
): AgendaQuery | undefined {
  const range = agendaRange(selected, view)
  const staffId = staff === "" ? undefined : agendaStaffId(staff)
  if (!range || (staff !== "" && staffId === undefined)) return undefined
  return { from: range.from, until: range.until, ...(staffId !== undefined ? { staffId } : {}) }
}

export function validAgendaQuery(query: AgendaQuery): boolean {
  try {
    if (!query || !civilDate(query.from) || !civilDate(query.until) || query.from > query.until)
      return false
    const from = civilDate(query.from)!,
      until = civilDate(query.until)!
    return (
      (until.getTime() - from.getTime()) / 86400000 < 62 &&
      (query.staffId === undefined ||
        (Number.isInteger(query.staffId) && query.staffId > 0 && query.staffId <= 2147483647))
    )
  } catch {
    return false
  }
}
