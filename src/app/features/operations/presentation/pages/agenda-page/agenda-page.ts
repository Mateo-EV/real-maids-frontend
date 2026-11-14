import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { form, FormField, FormRoot, required, submit, validate } from "@angular/forms/signals"
import { RouterLink } from "@angular/router"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmLabelImports } from "@spartan-ng/helm/label"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import {
  agendaQuery,
  agendaRange,
  agendaStaffId,
  AgendaView
} from "../../navigation/agenda-calendar"
import { AgendaStore } from "../../state/agenda.store"

@Component({
  selector: "app-agenda-page",
  providers: [AgendaStore],
  imports: [
    CatalogFrame,
    FormRoot,
    FormField,
    RouterLink,
    HlmButtonImports,
    HlmInputImports,
    HlmLabelImports,
    HlmNativeSelectImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./agenda-page.html"
})
export class AgendaPage {
  readonly store = inject(AgendaStore)
  private readonly destroyRef = inject(DestroyRef)
  readonly model = signal<{ date: string; view: AgendaView; staff: string }>({
    date: "",
    view: "day",
    staff: ""
  })
  readonly fields = form(this.model, path => {
    required(path.date, { message: "Selecciona una fecha." })
    validate(path.date, ({ value }) =>
      value() && !agendaRange(value(), this.model().view)
        ? { kind: "date", message: "Selecciona una fecha válida." }
        : undefined
    )
    validate(path.staff, ({ value }) =>
      value() !== "" && agendaStaffId(value()) === undefined
        ? { kind: "staff", message: "Usa un ID de personal entero positivo (máximo 2147483647)." }
        : undefined
    )
  })
  readonly applied = signal<{ date: string; view: AgendaView } | undefined>(undefined)
  readonly range = computed(() => {
    const selected = this.applied()
    return selected ? agendaRange(selected.date, selected.view) : undefined
  })
  readonly days = computed(() => {
    const entries = this.store.result() ?? []
    const requested = this.range()?.dates ?? []
    const dates = [
      ...requested,
      ...new Set(entries.map(entry => entry.date).filter(date => !requested.includes(date)))
    ]
    return dates.map(date => ({
      date,
      outsideRange: !requested.includes(date),
      entries: entries.filter(entry => entry.date === date)
    }))
  })
  readonly busy = computed(() => this.store.loading() || this.store.refreshing())
  search(): void {
    void submit(this.fields, async () => {
      this.load()
    })
  }

  private load(): void {
    if (this.destroyRef.destroyed) return
    const model = this.model()
    const query = agendaQuery(model.date, model.view, model.staff)
    if (!query) return
    this.applied.set({ date: model.date, view: model.view })
    this.store.loadAgenda(query).pipe(takeUntilDestroyed(this.destroyRef)).subscribe()
  }

  retry(): void {
    const query = this.store.query()
    if (this.destroyRef.destroyed || !query || this.busy()) return
    this.store.loadAgenda(query).pipe(takeUntilDestroyed(this.destroyRef)).subscribe()
  }
}
