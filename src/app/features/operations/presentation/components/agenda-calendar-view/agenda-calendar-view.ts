import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  PLATFORM_ID,
  untracked,
  viewChild
} from "@angular/core"
import { isPlatformBrowser } from "@angular/common"
import {
  CalendarOptions,
  EventClickInfo,
  EventDisplayInfo,
  EventInput,
  FullCalendarComponent,
  FullCalendarModule,
  MountInfo
} from "@fullcalendar/angular"
import type { Calendar } from "fullcalendar"
import dayGridPlugin from "@fullcalendar/angular/daygrid"
import timeGridPlugin from "@fullcalendar/angular/timegrid"
import classicTheme from "@fullcalendar/angular/themes/classic"
import esLocale from "fullcalendar/locales/es"
import { AgendaEntry } from "../../../domain/models/operations-read.models"
import { AgendaView } from "../../navigation/agenda-calendar"

/**
 * S8: FullCalendar renderer for the agenda. It owns only the library integration; the page keeps
 * the query, the explicit date and the navigation that follows a selected order.
 *
 * The agenda payload carries literal calendar dates and clock texts (`fecha`, `horaInicio`,
 * `horaFin`), not instants with an offset. The calendar therefore runs in the `UTC` time zone and
 * feeds it those literal texts: UTC keeps FullCalendar's date arithmetic equal to the supplied text,
 * so an 08:15 shift is drawn at 08:15 and on the same civil day in every browser zone. Any other
 * zone (`local` included) would shift the naive text by the browser offset and could move an order
 * to the previous or next day.
 */

/** S8 view mapping: the page keeps speaking day/week/month. */
const viewType: Record<AgendaView, string> = {
  day: "timeGridDay",
  week: "timeGridWeek",
  month: "dayGridMonth"
}

/**
 * Module-level identities: the Angular wrapper diffs each option by reference, so stable values
 * avoid re-setting the plugin and locale lists on every render.
 */
const plugins = [classicTheme, dayGridPlugin, timeGridPlugin]
const locales = [esLocale]
const noEvents: EventInput[] = []

const calendarDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(0, 0, 0, 0)
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

const clockRange = (entry: AgendaEntry): string =>
  `${entry.startTime} → ${entry.endTime ?? "No registrado"}`

/**
 * The event box stays compact; the full projection the query returned (order, clocks, status,
 * customer, property, service type and assigned staff) travels in the event's accessible label so
 * nothing the backend supplied is lost and no field is invented.
 */
const summary = (entry: AgendaEntry): string => {
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

const title = (entry: AgendaEntry): string =>
  `${entry.code} · ${clockRange(entry)} · ${entry.customerName}`

@Component({
  selector: "app-agenda-calendar-view",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FullCalendarModule],
  templateUrl: "./agenda-calendar-view.html",
  styleUrl: "./agenda-calendar-view.css"
})
export class AgendaCalendarView implements AfterViewInit {
  private readonly platformId = inject(PLATFORM_ID)
  /** SSR and prerender stop before any calendar DOM work: the library needs a real browser. */
  private readonly browser = isPlatformBrowser(this.platformId)
  private readonly calendar = viewChild(FullCalendarComponent)
  private api: Calendar | null = null

  readonly entries = input<readonly AgendaEntry[]>([])
  /** Explicit civil date (`YYYY-MM-DD`) chosen by the user; blank renders no calendar. */
  readonly selectedDate = input("")
  readonly view = input<AgendaView>("day")
  readonly busy = input(false)
  /** The page owns navigation: this component never imports Router. */
  readonly orderSelected = output<number>()

  /** Anchor text for `initialDate`/`now`: the explicit date at midnight, never the current date. */
  readonly anchor = computed(() => {
    const date = this.selectedDate()
    return calendarDate(date) ? `${date}T00:00:00` : undefined
  })
  readonly renderable = computed(() => this.browser && this.anchor() !== undefined)
  readonly events = computed<EventInput[]>(() => {
    const entries = this.entries()
    if (!entries.length) return noEvents
    return entries.map(entry => ({
      id: String(entry.orderId),
      title: title(entry),
      start: `${entry.date}T${entry.startTime}`,
      allDay: false
    }))
  })
  readonly options = computed<CalendarOptions>(() => ({
    plugins,
    locales,
    locale: "es",
    initialView: viewType[this.view()] ?? viewType.day,
    initialDate: this.anchor(),
    // Explicit "now": the calendar never falls back to the browser's current date.
    now: this.anchor(),
    timeZone: "UTC",
    firstDay: 1,
    editable: false,
    selectable: false,
    height: "auto",
    // No `today` action: the project never assumes the current date.
    headerToolbar: { left: "prev,next", center: "title", right: "" },
    events: this.events(),
    eventClick: this.handleEventClick,
    eventDidMount: this.handleEventDidMount
  }))

  constructor() {
    // The wrapper ignores `initialView` after mount, so later view/date changes go through the API.
    effect(() => {
      this.view()
      this.anchor()
      untracked(() => this.syncSelection())
    })
  }

  ngAfterViewInit(): void {
    this.api = this.calendar()?.getApi() ?? null
    this.syncSelection()
  }

  private readonly handleEventClick = (info: EventClickInfo): void => {
    const orderId = Number(info.event.id)
    if (!Number.isSafeInteger(orderId) || orderId <= 0 || orderId > 2147483647) return
    this.orderSelected.emit(orderId)
  }

  /** Stable test/DOM hooks plus the full plain-text projection the query returned. */
  private readonly handleEventDidMount = (info: MountInfo<EventDisplayInfo>): void => {
    const entry = this.entries().find(item => String(item.orderId) === info.event.id)
    info.el.setAttribute("data-agenda-entry", "")
    info.el.setAttribute("data-agenda-order-id", info.event.id)
    if (!entry) return
    const text = summary(entry)
    info.el.setAttribute("aria-label", text)
    info.el.setAttribute("title", text)
  }

  private syncSelection(): void {
    const api = this.api
    if (!api) return
    const type = viewType[this.view()] ?? viewType.day
    if (api.view.type !== type) api.changeView(type)
    const anchor = this.anchor()
    if (!anchor) return
    const date = api.getDate()
    if (!date || date.toISOString().slice(0, 10) !== anchor.slice(0, 10)) api.gotoDate(anchor)
  }
}
