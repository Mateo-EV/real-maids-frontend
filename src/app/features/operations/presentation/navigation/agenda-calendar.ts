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

export function agendaRange(selected: string, view: AgendaView): AgendaRange | undefined {
  const date = civilDate(selected)
  if (!date || !["day", "week", "month"].includes(view)) return undefined
  const first = new Date(date)
  const last = new Date(date)
  if (view === "week") last.setUTCDate(last.getUTCDate() + 6)
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
