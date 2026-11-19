import { GenerateReportParams } from "../params/reports-settings.params"

/** English projections of ReporteDtos, not additional SQL entities. */
export interface ReportType {
  type: string
  title: string
  description: string
}

export interface ReportTable {
  type: string
  title: string
  from: string
  to: string
  generatedAt: Date
  columns: string[]
  rows: unknown[][]
}

/** API supplies actor display text, not id_usuario; never fabricate a user ID. */
export interface GeneratedReportSummary {
  id: number
  type: string
  format: string
  parameters: string | null
  userName: string
  generatedAt: Date
}

/**
 * Rendering of one supplied table cell. Strings, numbers and booleans print literally — no
 * formatting, arithmetic or re-interpretation — and a null cell is an explicit empty cell
 * rather than an absent column or an invented zero.
 */
export const REPORT_EMPTY_CELL = "—"

export function reportCellText(cell: unknown): string {
  return cell === null || cell === undefined ? REPORT_EMPTY_CELL : String(cell)
}

/**
 * One CSV answer: the server bytes themselves plus the filename it supplied, if any. Bytes are
 * never re-encoded, re-ordered or rebuilt from the JSON table.
 */
export interface ReportCsvFile {
  bytes: Blob
  /** Value of the server's `Content-Disposition` filename, or `null` when it sent none. */
  fileName: string | null
}

const REPORT_CSV_FALLBACK_NAME = "reporte"
const REPORT_CSV_MAX_NAME = 120
// Path separators, Windows-reserved characters and control characters are never a filename.
const unsafeFileName = /[\u0000-\u001f\u007f\\/:*?"<>|]/g

function readableFileName(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .replace(unsafeFileName, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/^[.\s-]+/, "")
    .replace(/[.\s]+$/, "")
    .slice(0, REPORT_CSV_MAX_NAME - 4)
    .replace(/[.\s-]+$/, "")
}

function withCsvExtension(value: string): string {
  return `${value.replace(/\.csv$/i, "") || REPORT_CSV_FALLBACK_NAME}.csv`
}

/**
 * The name the browser saves the CSV under: the server's supplied filename when it is usable,
 * otherwise a readable name derived from the report type and the requested period. Either way
 * it is reduced to a single safe file name — no path, no control characters, always `.csv`.
 */
export function reportCsvFileName(fileName: string | null, params: GenerateReportParams): string {
  const supplied = readableFileName(fileName)
  if (supplied) return withCsvExtension(supplied)
  let type = ""
  let period = ""
  try {
    type = readableFileName(params.type).toLowerCase()
    const from = readableFileName(params.from)
    const to = readableFileName(params.to)
    if (from && to) period = `${from}-a-${to}`
    else if (from) period = `desde-${from}`
    else if (to) period = `hasta-${to}`
  } catch {
    // A getter-backed request cannot name the file; the fallback name still applies.
    return withCsvExtension(REPORT_CSV_FALLBACK_NAME)
  }
  return withCsvExtension([type, period].filter(Boolean).join("-"))
}

export interface DailyServices {
  date: string
  services: number
}

export interface StaffWorkload {
  staffId: number
  name: string
  services: number
  hours: string
}

export interface CurrentSituation {
  ordersByStatus: Record<string, number>
  servicesToday: number
  servicesNext7Days: number
  unscheduledOrders: number
  pendingRequests: number
  openSupportCases: number
  servicesByDay: DailyServices[]
  workloadNext7Days: StaffWorkload[]
}

export interface PeriodActivity {
  from: string
  to: string
  registeredRequests: number
  createdOrders: number
  completedOrders: number
  cancelledOrders: number
  completionRate: string | null
  completedAmount: string
  complaints: number
}

export interface DashboardSnapshot {
  generatedAt: Date
  current: CurrentSituation
  period: PeriodActivity
}
