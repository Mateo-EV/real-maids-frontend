import { AgendaEntry } from "../../domain/models/operations-read.models"

/**
 * Pure geometry of the agenda board. Nothing here reads the clock, the browser time zone or the
 * server: the backend supplies a literal civil date (`fecha`) and literal clock texts
 * (`horaInicio`/`horaFin`), and this module only maps those texts onto minutes of the same civil
 * day so the board can place a card without ever shifting it.
 */

const MINUTES_PER_HOUR = 60
const DAY_MINUTES = 24 * MINUTES_PER_HOUR
/**
 * Shortest box a card may occupy. A 20-minute shift still gets a readable card; the value only
 * changes how much room the card takes, never the clock text it displays.
 */
const MIN_SLOT_MINUTES = 30
/** A shift without a supplied end occupies one hour, the smallest useful block. */
const DEFAULT_SLOT_MINUTES = 60

const pad = (value: number) => String(value).padStart(2, "0")

/** Minutes since midnight of the same civil day. */
export interface AgendaClock {
  readonly start: number
  readonly end: number
}

export interface AgendaSlot {
  readonly entry: AgendaEntry
  readonly clock: AgendaClock
  /** Position inside the hour axis, in percent of its span. */
  readonly top: number
  readonly height: number
  readonly lane: number
  readonly lanes: number
}

export interface AgendaColumn {
  readonly date: string
  readonly weekday: string
  readonly dayNumber: string
  readonly slots: readonly AgendaSlot[]
}

export interface AgendaHourAxis {
  /** First drawn hour, and the exclusive end of the axis, as hours of the civil day. */
  readonly from: number
  readonly until: number
  readonly hours: readonly number[]
}

export interface AgendaTimeGrid {
  /** Absent when no in-window entry carries a usable clock: there is nothing to place. */
  readonly axis: AgendaHourAxis | undefined
  readonly columns: readonly AgendaColumn[]
  /** In-window entries that could not be placed, kept visible instead of silently dropped. */
  readonly unplaced: readonly AgendaEntry[]
}

export interface AgendaMonthCell {
  /** `null` for the alignment filler before the first day and after the last one. */
  readonly date: string | null
  readonly dayNumber: string
  readonly inMonth: boolean
  readonly entries: readonly AgendaEntry[]
}

/**
 * `HH:mm`, `HH:mm:ss` and `HH:mm:ss.ffffff` are all literal clock texts the API may return. The
 * fractional part is dropped because the axis works in whole minutes; the text itself is never
 * reformatted for display.
 */
export function parseClock(value: string): number | undefined {
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(value)
  if (!match) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3] ?? 0)
  if (minutes > 59 || seconds > 59) return undefined
  if (hours > 24 || (hours === 24 && (minutes !== 0 || seconds !== 0))) return undefined
  return hours * MINUTES_PER_HOUR + minutes
}

/** Clock span of one entry; a missing or earlier end falls back to the useful minimum. */
export function agendaClock(entry: AgendaEntry): AgendaClock | undefined {
  const start = parseClock(entry.startTime)
  if (start === undefined) return undefined
  const supplied = entry.endTime === null ? undefined : parseClock(entry.endTime)
  const end = supplied !== undefined && supplied > start ? supplied : start + DEFAULT_SLOT_MINUTES
  return {
    start,
    end: Math.max(Math.min(end, DAY_MINUTES), Math.min(start + MIN_SLOT_MINUTES, DAY_MINUTES))
  }
}

/** Hour band that actually holds the placed shifts, never a fixed business range. */
export function agendaHourAxis(clocks: readonly AgendaClock[]): AgendaHourAxis | undefined {
  if (!clocks.length) return undefined
  let first = DAY_MINUTES
  let last = 0
  for (const clock of clocks) {
    first = Math.min(first, clock.start)
    last = Math.max(last, clock.end)
  }
  const from = Math.floor(first / MINUTES_PER_HOUR)
  const until = Math.min(24, Math.max(from + 1, Math.ceil(last / MINUTES_PER_HOUR)))
  const hours: number[] = []
  for (let hour = from; hour < until; hour += 1) hours.push(hour)
  return { from, until, hours }
}

export const hourLabel = (hour: number): string => `${pad(hour)}:00`

const percentOf = (minutes: number, axis: AgendaHourAxis): number => {
  const span = (axis.until - axis.from) * MINUTES_PER_HOUR
  if (span <= 0) return 0
  const offset = minutes - axis.from * MINUTES_PER_HOUR
  return Math.min(100, Math.max(0, (offset / span) * 100))
}

interface Placed {
  readonly entry: AgendaEntry
  readonly clock: AgendaClock
}

/**
 * Greedy lane packing over connected overlap groups. Shifts sorted by start belong to the same group
 * while they start before the furthest end already seen, so a staggered run of shifts shares one
 * group instead of each shift measuring only its direct neighbours. Every member of a group gets the
 * group's lane count, which is what actually keeps simultaneous orders side by side instead of
 * covering each other's click target.
 */
function packLanes(items: readonly Placed[]): (Placed & { lane: number; lanes: number })[] {
  const ordered = [...items].sort(
    (left, right) =>
      left.clock.start - right.clock.start ||
      right.clock.end - left.clock.end ||
      left.entry.orderId - right.entry.orderId
  )
  const packed: (Placed & { lane: number; lanes: number })[] = []
  let group: Placed[] = []
  let groupEnd = 0

  const flush = () => {
    if (!group.length) return
    const laneEnds: number[] = []
    for (const item of group) {
      let lane = laneEnds.findIndex(end => end <= item.clock.start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(item.clock.end)
      } else {
        laneEnds[lane] = item.clock.end
      }
      packed.push({ ...item, lane, lanes: laneEnds.length })
    }
    // The group is sized by the lanes it used as a whole, so the count is final for every member.
    const lanes = laneEnds.length
    for (const item of packed.slice(packed.length - group.length)) item.lanes = lanes
    group = []
  }

  for (const item of ordered) {
    if (group.length && item.clock.start >= groupEnd) flush()
    group.push(item)
    groupEnd = group.length === 1 ? item.clock.end : Math.max(groupEnd, item.clock.end)
  }
  flush()
  return packed
}

const weekdayFormat = new Intl.DateTimeFormat("es", { weekday: "short", timeZone: "UTC" })

const civilDate = (text: string): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) return undefined
  const date = new Date(0)
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  date.setUTCHours(0, 0, 0, 0)
  return date.toISOString().slice(0, 10) === text ? date : undefined
}

/** Weekday of the supplied civil date, 0 = Monday, matching the queried Monday→Sunday week. */
export function civilWeekday(text: string): number {
  const date = civilDate(text)
  return date ? (date.getUTCDay() + 6) % 7 : 0
}

export function weekdayShort(text: string): string {
  const date = civilDate(text)
  return date ? weekdayFormat.format(date).replace(/\./g, "") : ""
}

const compareEntries = (left: AgendaEntry, right: AgendaEntry): number => {
  const leftStart = parseClock(left.startTime)
  const rightStart = parseClock(right.startTime)
  if (leftStart !== rightStart) {
    if (leftStart === undefined) return 1
    if (rightStart === undefined) return -1
    return leftStart - rightStart
  }
  return left.orderId - right.orderId
}

/**
 * Day and week board. Only the supplied window is drawn, so a shift the backend returned outside
 * the consulted range never appears on another day's column; the page reports those separately.
 */
export function agendaTimeGrid(
  dates: readonly string[],
  entries: readonly AgendaEntry[]
): AgendaTimeGrid {
  const buckets = new Map<string, Placed[]>()
  for (const date of dates) buckets.set(date, [])
  const unplaced: AgendaEntry[] = []
  for (const entry of entries) {
    const bucket = buckets.get(entry.date)
    if (!bucket) continue
    const clock = agendaClock(entry)
    if (clock === undefined) {
      unplaced.push(entry)
      continue
    }
    bucket.push({ entry, clock })
  }
  const axis = agendaHourAxis([...buckets.values()].flat().map(item => item.clock))
  const columns = dates.map(date => {
    const slots = axis
      ? packLanes(buckets.get(date) ?? []).map(item => ({
          entry: item.entry,
          clock: item.clock,
          top: percentOf(item.clock.start, axis),
          height: Math.max(percentOf(item.clock.end, axis) - percentOf(item.clock.start, axis), 1),
          lane: item.lane,
          lanes: item.lanes
        }))
      : []
    return { date, weekday: weekdayShort(date), dayNumber: date.slice(8, 10), slots }
  })
  return { axis, columns, unplaced }
}

/** Month board: the queried dates aligned Monday-first, padded with empty filler cells. */
export function agendaMonthCells(
  dates: readonly string[],
  entries: readonly AgendaEntry[]
): readonly AgendaMonthCell[] {
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (!first || !last) return []
  const buckets = new Map<string, AgendaEntry[]>()
  for (const date of dates) buckets.set(date, [])
  for (const entry of entries) buckets.get(entry.date)?.push(entry)
  for (const bucket of buckets.values()) bucket.sort(compareEntries)

  const filler = (): AgendaMonthCell => ({ date: null, dayNumber: "", inMonth: false, entries: [] })
  const cells: AgendaMonthCell[] = []
  for (let index = civilWeekday(first); index > 0; index -= 1) cells.push(filler())
  for (const date of dates) {
    cells.push({
      date,
      dayNumber: date.slice(8, 10),
      inMonth: true,
      entries: buckets.get(date) ?? []
    })
  }
  while (cells.length % 7 !== 0) cells.push(filler())
  return cells
}

const clockRange = (entry: AgendaEntry): string =>
  `${entry.startTime} → ${entry.endTime ?? "No registrado"}`

/**
 * Names of the staff the API assigned to a shift. The backend decides who is assigned, so this only
 * joins the supplied names; nobody is inferred from the order, the customer or the session.
 */
export function agendaStaffNames(entry: AgendaEntry): string {
  const names = entry.assignedStaff
    .map(member => member.name.trim())
    .filter(name => name.length > 0)
  return names.length ? names.join(", ") : "Sin personal asignado"
}

/**
 * The whole projection the query returned travels in the accessible label, so the compact card
 * never hides a supplied field and never invents one.
 */
export function agendaEntryLabel(entry: AgendaEntry): string {
  const staff = entry.assignedStaff.length
    ? entry.assignedStaff
        .map(
          member =>
            `${member.name} · ID ${member.staffId} · ${member.role} · ${member.phone ?? "No registrado"}`
        )
        .join(" | ")
    : "Sin personal asignado"
  return [
    `${entry.date} · ${entry.code} · Orden ID ${entry.orderId}`,
    clockRange(entry),
    `Estado: ${entry.status}`,
    `Cliente: ${entry.customerName}`,
    `Propiedad: ${entry.propertyName}`,
    `Servicio: ${entry.serviceTypeName ?? "No registrado"}`,
    `Personal: ${staff}`
  ].join("\n")
}

/**
 * Card tone of the documented order states. It only decorates: every card also prints its status
 * text, so color is never the only signal and an unknown code simply stays neutral.
 */
export function agendaStatusTone(status: string): "navy" | "amber" | "green" | "coral" | "muted" {
  switch (status) {
    case "PENDIENTE":
    case "PROGRAMADA":
      return "navy"
    case "EN_PROCESO":
      return "amber"
    case "COMPLETADA":
    case "PAGADO":
      return "green"
    case "CANCELADA":
      return "coral"
    default:
      return "muted"
  }
}
