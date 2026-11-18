import { isPlatformBrowser } from "@angular/common"
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  PLATFORM_ID
} from "@angular/core"
import { AgendaEntry } from "../../../domain/models/operations-read.models"
import { AgendaView, agendaRange } from "../../navigation/agenda-calendar"
import {
  AgendaMonthCell,
  AgendaSlot,
  agendaEntryLabel,
  agendaMonthCells,
  agendaStatusTone,
  agendaTimeGrid,
  hourLabel,
  weekdayShort
} from "../../navigation/agenda-layout"

/** Monday-first weekday strip of the month board; the queried week is always Monday→Sunday. */
const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const

interface AgendaSlotView {
  readonly entry: AgendaEntry
  readonly label: string
  readonly tone: string
  readonly top: number
  readonly height: number
  readonly lane: number
  readonly lanes: number
  readonly left: string
  readonly width: string
}

interface AgendaColumnView {
  readonly date: string
  readonly weekday: string
  readonly dayNumber: string
  readonly slots: readonly AgendaSlotView[]
}

interface AgendaChipView {
  readonly entry: AgendaEntry
  readonly label: string
  readonly tone: string
}

interface AgendaMonthCellView {
  readonly date: string | null
  readonly dayNumber: string
  readonly inMonth: boolean
  readonly weekday: string
  readonly chips: readonly AgendaChipView[]
}

/**
 * Own agenda board built from the project's own tokens and Helm pieces, with no calendar library.
 *
 * The renderer only owns geometry and markup: the page keeps the query, the explicit reference
 * date and the navigation that follows a selected order. The backend supplies literal civil dates
 * and clock texts, so every value shown here is the supplied text — no time zone, no `today` and no
 * server-rendered schedule.
 */
@Component({
  selector: "app-agenda-board",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./agenda-board.html",
  styleUrl: "./agenda-board.css"
})
export class AgendaBoard {
  /** SSR and prerender render nothing: the board is a client-side reading surface. */
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))

  readonly entries = input<readonly AgendaEntry[]>([])
  /** Explicit civil date (`YYYY-MM-DD`) chosen by the user; blank renders nothing. */
  readonly selectedDate = input("")
  readonly view = input<AgendaView>("day")
  readonly busy = input(false)
  /** The page owns navigation: this component never imports Router. */
  readonly orderSelected = output<number>()

  readonly weekdays = WEEKDAYS
  readonly hourLabel = hourLabel

  readonly range = computed(() => agendaRange(this.selectedDate(), this.view()))
  readonly renderable = computed(() => this.browser && this.range() !== undefined)

  private readonly timeGrid = computed(() => {
    const range = this.range()
    if (!range || this.view() === "month") return undefined
    return agendaTimeGrid(range.dates, this.entries())
  })

  private readonly monthGrid = computed(() => {
    const range = this.range()
    if (!range || this.view() !== "month") return undefined
    return agendaMonthCells(range.dates, this.entries())
  })

  readonly axis = computed(() => this.timeGrid()?.axis)
  readonly unplaced = computed<readonly AgendaChipView[]>(() =>
    (this.timeGrid()?.unplaced ?? []).map(entry => this.chip(entry))
  )
  readonly columns = computed<readonly AgendaColumnView[]>(() =>
    (this.timeGrid()?.columns ?? []).map(column => ({
      date: column.date,
      weekday: column.weekday,
      dayNumber: column.dayNumber,
      slots: column.slots.map(slot => this.slot(slot))
    }))
  )
  readonly monthCells = computed<readonly AgendaMonthCellView[]>(
    () => this.monthGrid()?.map(cell => this.monthCell(cell)) ?? []
  )
  readonly dayView = computed(() => this.view() === "day")
  /**
   * Column and hour counts travel as CSS custom properties: the grid geometry lives in one CSS
   * rule instead of a per-run template style.
   */
  readonly boardVars = computed<Record<string, string>>(() => ({
    "--agenda-columns": String(Math.max(1, this.columns().length)),
    "--agenda-hours": String(Math.max(1, this.axis()?.hours.length ?? 1))
  }))
  readonly hasContent = computed(
    () => this.monthCells().length > 0 || this.axis() !== undefined || this.unplaced().length > 0
  )

  select(entry: AgendaEntry): void {
    const orderId = entry.orderId
    if (!Number.isSafeInteger(orderId) || orderId <= 0 || orderId > 2147483647) return
    this.orderSelected.emit(orderId)
  }

  private chip(entry: AgendaEntry): AgendaChipView {
    return { entry, label: agendaEntryLabel(entry), tone: agendaStatusTone(entry.status) }
  }

  private slot(slot: AgendaSlot): AgendaSlotView {
    return {
      entry: slot.entry,
      label: agendaEntryLabel(slot.entry),
      tone: agendaStatusTone(slot.entry.status),
      top: slot.top,
      height: slot.height,
      lane: slot.lane,
      lanes: slot.lanes,
      // Two simultaneous orders share the lane area instead of hiding each other.
      left: `calc(${(slot.lane / slot.lanes) * 100}% + 2px)`,
      width: `calc(${100 / slot.lanes}% - 4px)`
    }
  }

  private monthCell(cell: AgendaMonthCell): AgendaMonthCellView {
    return {
      date: cell.date,
      dayNumber: cell.dayNumber,
      inMonth: cell.inMonth,
      weekday: cell.date === null ? "" : weekdayShort(cell.date),
      chips: cell.entries.map(entry => this.chip(entry))
    }
  }
}
