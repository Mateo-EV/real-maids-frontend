import { signal } from "@angular/core"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { UserStore } from "../../state/user.store"
import { UpdateUserStatusByIdUseCase } from "../../../application/use-cases/update-user-status-by-id.use-case"
import { By } from "@angular/platform-browser"
import { BrnCombobox } from "@spartan-ng/brain/combobox"
import { USER_REPOSITORY } from "../../../domain/repositories/user.repository"
import { UserListQuery } from "../../../domain/models/user-list-query"
import { UserError } from "../../../domain/errors/user.error"
import { provideRouter } from "@angular/router"
import { TestBed } from "@angular/core/testing"
import { Observable, of, Subject } from "rxjs"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Lang, User } from "../../../domain/entities/user.entity"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { AUDIT_LOG_REPOSITORY } from "../../../domain/repositories/audit-log.repository"
import { AuditLog } from "../../../domain/entities/audit-log.entity"
import { AuditFilters, AuditQuery } from "../../../domain/models/audit-query"
import { AuditPage } from "../../../domain/models/audit-page"
import { AuditLogError } from "../../../domain/errors/audit-log.error"
import { AuditCsvDownload } from "../../../infrastructure/export/audit-csv-download"
import { AuditLogsStore } from "../../state/audit-logs.store"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { AuditViewer } from "./audit-viewer"

const log = AuditLog.create(
  9,
  2,
  "usuario",
  "ACTUALIZAR",
  "Sintético",
  "192.0.2.1",
  new Date("2026-09-01T23:59:59Z"),
  "Actor",
  "3",
  []
)
const page = (total = 17, current = 0): AuditPage => ({
  items: total ? [log] : [],
  total,
  offset: current * 5,
  limit: 5,
  page: current,
  size: 5,
  totalPages: Math.ceil(total / 5),
  globalTotal: 90
})
function selectActor(fixture: ReturnType<typeof TestBed.createComponent<AuditViewer>>, id: string) {
  fixture.detectChanges()
  const combobox = fixture.debugElement.query(By.directive(BrnCombobox)).injector.get(BrnCombobox)
  combobox.select(id || "all")
  fixture.detectChanges()
}
describe("Audit viewer server queries and CSV", () => {
  beforeEach(() => {
    // jsdom has no element-size observer; overlay geometry remains browser acceptance work.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
  })
  afterEach(() => vi.unstubAllGlobals())
  function setup() {
    const reads = new Subject<Result<AuditPage, AuditLogError>>()
    const exports = new Subject<Result<Blob, AuditLogError>>()
    const getAuditLogs = vi.fn((_query?: AuditQuery) => reads)
    const exportAuditLogs = vi.fn((_filters?: AuditFilters) => exports)
    const download = vi.fn((_blob: Blob) => Result.success(undefined)),
      success = vi.fn()
    const users = [
      User.create(2, "Ana", "ana@example.test", Lang.ES, true, new Date(), new Date(), 1),
      User.create(7, "Ana", "otra@example.test", Lang.ES, true, new Date(), new Date(), 1)
    ]
    const getUsersPage = vi.fn(
      (query: UserListQuery): Observable<Result<PaginationResponse<User>, UserError>> => {
        const items = users.filter(
          user =>
            !query.search ||
            `${user.name} ${user.email}`.toLowerCase().includes(query.search.toLowerCase())
        )
        return of(
          Result.success({
            items,
            total: items.length,
            offset: query.offset ?? 0,
            limit: query.limit ?? 10
          })
        )
      }
    )
    const session = signal<AuthSession | null>(
      AuthSession.create("Test", "test@example.test", null, null, 1)
    )
    const sessionChanges = new Subject<AuthSession | null>()
    const status = { execute: vi.fn(() => of(Result.success(users[0]))) }
    TestBed.configureTestingModule({
      imports: [AuditViewer],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { session } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => sessionChanges } },
        { provide: UpdateUserStatusByIdUseCase, useValue: status },
        { provide: USER_REPOSITORY, useValue: { getUsersPage } },
        { provide: AUDIT_LOG_REPOSITORY, useValue: { getAuditLogs, exportAuditLogs } },
        { provide: AuditCsvDownload, useValue: { download } },
        { provide: HotToastService, useValue: { success } }
      ]
    })
    const fixture = TestBed.createComponent(AuditViewer)
    fixture.detectChanges()
    return {
      users,
      session,
      sessionChanges,
      status,
      getUsersPage,
      fixture,
      viewer: fixture.componentInstance,
      element: fixture.nativeElement as HTMLElement,
      reads,
      exports,
      getAuditLogs,
      exportAuditLogs,
      download,
      success
    }
  }
  it("invalidates actor options on writes independently, preserves selection, and clears it on session loss", () => {
    const { viewer, fixture, getUsersPage, session, sessionChanges, users, status } = setup()
    viewer.selectActor("7")
    getUsersPage.mockReturnValueOnce(
      of(Result.success({ items: [users[0]], total: 1, offset: 0, limit: 10 }))
    )
    TestBed.inject(UserStore).updateUserStatusById(2, false).subscribe()
    expect(status.execute).toHaveBeenCalledOnce()
    expect(getUsersPage).toHaveBeenCalledTimes(2)
    expect(viewer.actors.result()?.items).toEqual([users[0]])
    expect(viewer.selectedActor()?.id).toBe(7)
    expect(viewer.filters().userId).toBe(7)
    session.set(null)
    sessionChanges.next(null)
    expect(viewer.actors.result()).toBeUndefined()
    fixture.detectChanges()
    expect(viewer.selectedActor()).toBeUndefined()
    expect(viewer.filters().userId).toBeUndefined()
  })
  it("owns an independent server lookup without overwriting the parent listing", () => {
    const { viewer, fixture, getUsersPage } = setup()
    expect(getUsersPage).toHaveBeenCalledExactlyOnceWith({ offset: 0, limit: 10 })
    expect(fixture.debugElement.injector.get(UserStore)).toBe(TestBed.inject(UserStore))
    const parentQuery = signal<UserListQuery>({ offset: 0, limit: 10, roleId: 9 })
    const parent = TestBed.inject(UserStore).selectQuery(parentQuery)
    expect(parent.result()).toBeUndefined()
    expect(viewer.actors.result()).toBeDefined()
    viewer.searchActors("unknown ID 999")
    expect(viewer.filters().userId).toBeUndefined()
  })
  it("cancels obsolete lookup reads, adopts effective server pages, rejects typed identity and cancels on destroy", async () => {
    const { fixture, viewer, getUsersPage, getAuditLogs, users } = setup()
    const pending = new Subject<Result<PaginationResponse<User>, UserError>>()
    getUsersPage.mockReturnValueOnce(pending)
    viewer.retryActors()
    expect(pending.observed).toBe(true)
    viewer.searchActors("Ana")
    expect(pending.observed).toBe(false)
    pending.next(Result.success({ items: [], total: 0, offset: 0, limit: 10 }))
    viewer.selectActor("7")
    viewer.selectActor("999")
    expect(viewer.filters().userId).toBeUndefined()
    await vi.waitFor(() => expect(viewer.actors.loaded()).toBe(true))
    viewer.selectActor("7")
    getUsersPage.mockReturnValueOnce(
      of(Result.success({ items: [users[0]], total: 11, offset: 0, limit: 5 }))
    )
    viewer.retryActors()
    expect(viewer.actorPageCount()).toBe(3)
    getUsersPage.mockReturnValueOnce(
      of(Result.success({ items: [users[0]], total: 11, offset: 5, limit: 5 }))
    )
    viewer.goToActorPage(2)
    expect(getUsersPage).toHaveBeenLastCalledWith({ search: "Ana", offset: 5, limit: 5 })
    expect(viewer.actorPage()).toBe(2)
    expect(viewer.actorOptions().map(user => user.id)).toEqual([7, 2])
    expect(viewer.filters().userId).toBe(7)
    const parentQuery = signal<UserListQuery>({ offset: 0, limit: 10 })
    expect(TestBed.inject(UserStore).selectQuery(parentQuery).query()).toEqual({
      offset: 0,
      limit: 10
    })
    const calls = getUsersPage.mock.calls.length
    viewer.goToActorPage(0)
    viewer.goToActorPage(4)
    expect(getUsersPage).toHaveBeenCalledTimes(calls)
    // Lookup pages/search never submit audit identities or reset the applied audit page.
    expect(getAuditLogs).toHaveBeenCalledTimes(2)
    const late = new Subject<Result<PaginationResponse<User>, UserError>>()
    getUsersPage.mockReturnValueOnce(late)
    viewer.retryActors()
    fixture.destroy()
    expect(late.observed).toBe(false)
    expect(viewer.actors.loading()).toBe(false)
  })
  it("keeps lookup failure independent from audit export and freezes lookup controls during export", () => {
    const { fixture, viewer, reads, getUsersPage, exportAuditLogs } = setup()
    viewer.selectActor("2")
    getUsersPage.mockReturnValueOnce(of(Result.failure(new UserError("FORBIDDEN"))))
    viewer.retryActors()
    expect(viewer.actors.error()?.code).toBe("FORBIDDEN")
    reads.next(Result.success(page()))
    reads.complete()
    viewer.exportCsv()
    const calls = getUsersPage.mock.calls.length
    viewer.searchActors("new")
    viewer.retryActors()
    viewer.goToActorPage(2)
    viewer.selectActor("all")
    expect(getUsersPage).toHaveBeenCalledTimes(calls)
    expect(exportAuditLogs).toHaveBeenCalledExactlyOnceWith({ userId: 2 })
    expect(viewer.selectedActor()?.id).toBe(2)
    fixture.destroy()
  })
  it("reveals advanced fields locally, preserves values and shows independently removable applied chips", () => {
    const { fixture, viewer, element, getAuditLogs } = setup()
    const toggle = element.querySelector<HTMLButtonElement>("[data-audit-more]")!
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(element.querySelector("#audit-advanced")?.hasAttribute("hidden")).toBe(true)
    expect(element.querySelector("[data-audit-clear]")).toBeNull()
    const calls = getAuditLogs.mock.calls.length
    toggle.click()
    fixture.detectChanges()
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(getAuditLogs).toHaveBeenCalledTimes(calls)
    viewer.filterModel.update(model => ({
      ...model,
      fromUTC: "2026-09-01",
      toUTC: "2026-09-02",
      actorSearch: "Ana"
    }))
    viewer.setFrom("2026-09-01")
    viewer.setTo("2026-09-02")
    viewer.selectActor("2")
    viewer.setEntity("usuario")
    viewer.setAction("ACTUALIZAR")
    fixture.detectChanges()
    expect(element.querySelector("[data-audit-secondary-count]")?.textContent?.trim()).toBe("4")
    const filteredCalls = getAuditLogs.mock.calls.length
    toggle.click()
    fixture.detectChanges()
    expect(getAuditLogs).toHaveBeenCalledTimes(filteredCalls)
    expect(element.querySelector<HTMLInputElement>("#audit-from")?.value).toBe("2026-09-01")
    expect(element.querySelectorAll("[data-audit-chip]")).toHaveLength(5)
    expect(
      element.querySelector("#audit-advanced")?.contains(element.querySelector("[data-audit-chip]"))
    ).toBe(false)
    element
      .querySelector<HTMLButtonElement>('[aria-label="Quitar Desde (UTC): 2026-09-01"]')!
      .click()
    fixture.detectChanges()
    expect(viewer.filters()).toMatchObject({
      userId: 2,
      toUTC: "2026-09-02",
      entity: "usuario",
      action: "ACTUALIZAR"
    })
    expect(viewer.filters().fromUTC).toBeUndefined()
    expect(viewer.filterModel().fromUTC).toBe("")
    expect(element.querySelector("[data-audit-secondary-count]")?.textContent?.trim()).toBe("3")
    element.querySelector<HTMLButtonElement>("[data-audit-clear]")!.click()
    fixture.detectChanges()
    expect(viewer.filters()).toEqual({})
    expect(element.querySelector("[data-audit-clear]")).toBeNull()
    expect(element.querySelectorAll("[data-audit-chip]")).toHaveLength(0)
    expect(element.querySelector("[data-audit-secondary-count]")).toBeNull()
  })
  it("excludes actor, search and default options from secondary applied counts", () => {
    const { fixture, viewer, element } = setup()
    viewer.selectActor("2")
    viewer.filterModel.update(model => ({ ...model, actorSearch: "Ana" }))
    viewer.setEntity("")
    viewer.setAction("")
    fixture.detectChanges()
    expect(element.querySelector("[data-audit-secondary-count]")).toBeNull()
    expect(element.querySelectorAll("[data-audit-chip]")).toHaveLength(1)
    expect(element.querySelector("[data-audit-clear]")).not.toBeNull()
  })
  it("groups the title and toolbar in the form header and keeps advanced fields separate", () => {
    const { element } = setup()
    const form = element.querySelector("form")!
    const fields = Array.from(form.querySelectorAll<HTMLElement>('[data-slot="field"]'))
    expect(fields).toHaveLength(5)
    const grid = fields[1].parentElement!
    expect(grid).not.toBe(form)
    expect(grid.classList.contains("grid")).toBe(true)
    expect(fields.slice(1).every(field => field.parentElement === grid)).toBe(true)
    expect(grid.parentElement?.id).toBe("audit-advanced")
    expect(grid.parentElement?.parentElement).toBe(form)
    const header = form.firstElementChild!
    expect(header.querySelector("#audit-title")).not.toBeNull()
    expect(header.querySelector("[data-audit-toolbar]")?.parentElement).toBe(header)
    expect(grid.parentElement?.previousElementSibling).toBe(header)

    for (const id of ["audit-from", "audit-to", "audit-entity", "audit-action"]) {
      expect(grid.querySelector(`label[for="${id}"]`)?.textContent?.trim()).toBeTruthy()
      expect(grid.querySelector(`#${id}`)).not.toBeNull()
    }
    for (const helpId of ["audit-range-help", "audit-actor-help"]) {
      expect(element.querySelector(`#${helpId}`)?.textContent?.trim()).toBeTruthy()
    }
    expect(grid.querySelector(".catalog-filter-search")).toBeNull()
    const actions = Array.from(form.querySelectorAll<HTMLButtonElement>("button"))
    expect(actions).toHaveLength(3)
    expect(actions[0].parentElement).not.toBe(grid)
    expect(form.querySelector("[data-audit-toolbar]")?.contains(actions[0])).toBe(true)
    expect(actions.slice(1).map(button => button.textContent?.trim())).toEqual([
      "Más filtros",
      "Exportar CSV"
    ])
    expect(form.querySelector('label[for="audit-actor"]')?.textContent).toContain(
      "Usuario responsable"
    )
    expect(actions[0].getAttribute("role")).toBe("combobox")
    expect(actions.every(button => button.type === "button")).toBe(true)
  })
  it("debounces independent server search and retains selected identity across lookup failures and gaps", async () => {
    const { fixture, viewer, element, getUsersPage, getAuditLogs } = setup()
    element.querySelector<HTMLButtonElement>("#audit-actor")!.click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    const search = document.querySelector<HTMLInputElement>("#audit-actor-search")!
    expect(search).not.toBeNull()
    const type = (text: string) => {
      search.value = text
      search.dispatchEvent(new Event("input"))
      fixture.detectChanges()
    }
    expect(document.querySelector('[data-slot="combobox-list"]')?.textContent).toContain(
      "otra@example.test"
    )
    type("ana")
    type(" OTRA@ ")
    expect(viewer.actors.loading()).toBe(true)
    expect(getUsersPage).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(getUsersPage).toHaveBeenCalledTimes(2))
    fixture.detectChanges()
    expect(getUsersPage).toHaveBeenLastCalledWith({ offset: 0, limit: 10, search: "OTRA@" })
    expect(viewer.actorOptions().map(actor => actor.email)).toEqual(["otra@example.test"])
    expect(getAuditLogs).toHaveBeenCalledOnce()
    selectActor(fixture, "7")
    expect(viewer.filters().userId).toBe(7)
    type("2")
    expect(viewer.filters().userId).toBe(7)
    getUsersPage.mockReturnValueOnce(of(Result.failure(new UserError("FORBIDDEN"))))
    viewer.retryActors()
    fixture.detectChanges()
    expect(element.textContent).toContain("No pudimos buscar actores")
    getUsersPage.mockReturnValueOnce(
      of(Result.success({ items: [], total: 0, offset: 0, limit: 10 }))
    )
    viewer.retryActors()
    fixture.detectChanges()
    expect(element.textContent).not.toContain("Catálogo incompleto")
    expect(viewer.actorOptions()).toMatchObject([
      { id: 7, name: "Ana", email: "otra@example.test" }
    ])
    expect(viewer.filters().userId).toBe(7)
    expect(element.querySelector("#audit-actor")?.textContent).toContain("otra@example.test")
    selectActor(fixture, "")
    expect(viewer.filters().userId).toBeUndefined()
    viewer.clearFilters()
    fixture.detectChanges()
    expect(viewer.filterModel().actorSearch).toBe("")
  })
  it("selects a searched actor with library keyboard behavior while typing and erasing never apply identity", async () => {
    const { fixture, viewer, element, getAuditLogs } = setup()
    element.querySelector<HTMLButtonElement>("#audit-actor")!.click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    const search = document.querySelector<HTMLInputElement>("#audit-actor-search")!
    search.value = "otra@"
    search.dispatchEvent(new Event("input"))
    fixture.detectChanges()
    expect(getAuditLogs).toHaveBeenCalledOnce()
    expect(viewer.filters().userId).toBeUndefined()
    await vi.waitFor(() => expect(viewer.actors.loaded()).toBe(true))
    fixture.detectChanges()
    const options = document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]')
    // jsdom has no layout/scrolling; retain real library key handling.
    options.forEach(option => {
      option.scrollIntoView = vi.fn()
    })
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", keyCode: 40, bubbles: true })
    )
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", keyCode: 40, bubbles: true })
    )
    fixture.detectChanges()
    expect(search.getAttribute("aria-activedescendant")).toBeTruthy()
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(viewer.filters().userId).toBe(7)
    expect(element.querySelector("#audit-actor")?.textContent).toContain("otra@example.test")
    const calls = getAuditLogs.mock.calls.length
    element.querySelector<HTMLButtonElement>("#audit-actor")!.click()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    const reopened = document.querySelector<HTMLInputElement>("#audit-actor-search")!
    reopened.value = ""
    reopened.dispatchEvent(new Event("input"))
    fixture.detectChanges()
    expect(viewer.filters().userId).toBe(7)
    expect(getAuditLogs).toHaveBeenCalledTimes(calls)
    const allActors = document.querySelector<HTMLElement>('[data-slot="combobox-item"]')!
    allActors.scrollIntoView = vi.fn()
    allActors.click()
    fixture.detectChanges()
    expect(viewer.filters().userId).toBeUndefined()
    expect(element.querySelector("#audit-actor")?.textContent).toContain("Todos los actores")
  })
  it("removes each applied field without changing other fields and resets the query page", () => {
    const { fixture, viewer, element, getAuditLogs } = setup()
    for (const field of ["userId", "fromUTC", "toUTC", "entity", "action"] as const) {
      viewer.selectActor("2")
      viewer.filterModel.update(model => ({ ...model, fromUTC: "2026-09-01", toUTC: "2026-09-02" }))
      viewer.setFrom("2026-09-01")
      viewer.setTo("2026-09-02")
      viewer.setEntity("usuario")
      viewer.setAction("ACTUALIZAR")
      viewer.page.set(3)
      const before = { ...viewer.filters() }
      viewer.removeFilter(field)
      fixture.detectChanges()
      expect(viewer.filters()).toEqual({ ...before, [field]: undefined })
      expect(viewer.page()).toBe(1)
      expect(getAuditLogs.mock.calls.at(-1)?.[0]).toMatchObject({ page: 0, size: 5 })
      expect(element.querySelectorAll("[data-audit-chip]")).toHaveLength(4)
    }
    viewer.clearFilters()
    viewer.searchActors("Ana")
    fixture.detectChanges()
    expect(element.querySelector("[data-audit-clear]")).toBeNull()
  })
  it("shows loading, server totals, responsive metadata and inclusive UTC help", () => {
    const { fixture, viewer, element, reads, getAuditLogs } = setup()
    expect(element.textContent).toContain("Cargando")
    expect(getAuditLogs).toHaveBeenCalledExactlyOnceWith({ page: 0, size: 5 })
    reads.next(Result.success(page()))
    reads.complete()
    fixture.detectChanges()
    expect(element.querySelectorAll("tr[data-audit-row]")).toHaveLength(1)
    expect(element.querySelectorAll("[data-audit-card]")).toHaveLength(1)
    expect(element.textContent).toContain("de 17 registros")
    expect(element.textContent).toContain("ACTUALIZAR")
    expect(element.textContent).toContain("desde y hasta incluidos")
    expect(element.textContent).toContain("10000")
    expect(viewer.pageCount()).toBe(4)
    for (const id of ["audit-from", "audit-to", "audit-actor", "audit-entity", "audit-action"]) {
      expect(element.querySelector(`label[for="${id}"]`)).not.toBeNull()
      expect(element.querySelector(`.catalog-filter-row #${id}`)).not.toBeNull()
    }
    expect(element.querySelectorAll("thead th[scope='col']")).toHaveLength(7)
  })
  it("cancels superseded queries and combines actor/range/entity/action in zero-based pages", () => {
    const { fixture, viewer, reads, getAuditLogs } = setup()
    const next = new Subject<Result<AuditPage, AuditLogError>>()
    getAuditLogs.mockReturnValue(next)
    viewer.setFrom("2026-09-01")
    expect(reads.observed).toBe(false)
    viewer.setTo("2026-09-02")
    selectActor(fixture, "2")
    viewer.setEntity("usuario")
    viewer.setAction("ACTUALIZAR")
    expect(getAuditLogs).toHaveBeenLastCalledWith({
      fromUTC: "2026-09-01",
      toUTC: "2026-09-02",
      dayUTC: undefined,
      userId: 2,
      entity: "usuario",
      action: "ACTUALIZAR",
      page: 0,
      size: 5
    })
    next.next(Result.success(page()))
    next.complete()
    viewer.goToPage(2)
    expect(getAuditLogs.mock.calls.at(-1)?.[0]).toMatchObject({ page: 1, size: 5, userId: 2 })
    fixture.destroy()
    expect(next.observed).toBe(false)
  })
  it("renders retryable query errors and disables no-data exports", () => {
    const { fixture, viewer, element, reads, getAuditLogs, exportAuditLogs } = setup()
    reads.next(Result.failure(new AuditLogError("FORBIDDEN")))
    reads.complete()
    fixture.detectChanges()
    expect(element.querySelector('[role="alert"]')?.textContent).toContain("autorización")
    viewer.exportCsv()
    expect(exportAuditLogs).not.toHaveBeenCalled()
    getAuditLogs.mockReturnValue(of(Result.success(page(0))) as never)
    viewer.clearFilters()
    fixture.detectChanges()
    expect(element.textContent).toContain("Sin resultados")
    expect(element.querySelector<HTMLButtonElement>("[data-audit-export]")?.disabled).toBe(true)
    viewer.exportCsv()
    expect(exportAuditLogs).not.toHaveBeenCalled()
  })
  it("clamps a server page that shrank and cancels component-owned reads on destroy", () => {
    const { fixture, viewer, reads, getAuditLogs } = setup()
    reads.next(Result.success(page()))
    reads.complete()
    getAuditLogs.mockReturnValue(of(Result.success(page(1))) as never)
    viewer.goToPage(3)
    expect(viewer.page()).toBe(1)
    expect(getAuditLogs.mock.calls.at(-1)?.[0]).toEqual({ page: 0, size: 5 })
    const pending = new Subject<Result<AuditPage, AuditLogError>>()
    getAuditLogs.mockReturnValue(pending)
    viewer.retry()
    fixture.destroy()
    expect(pending.observed).toBe(false)
    expect(TestBed.inject(AuditLogsStore).loading()).toBe(false)
  })
  it("opens the selected backend log", () => {
    const { fixture, element, reads } = setup()
    reads.next(Result.success(page()))
    reads.complete()
    fixture.detectChanges()
    const open = vi.spyOn(TestBed.inject(HlmDialogService), "open").mockReturnValue({} as never)
    element.querySelector<HTMLButtonElement>("[data-audit-detail]")!.click()
    expect(open.mock.calls[0][1]?.context).toMatchObject({ logId: 9 })
  })
  it("exports exact server bytes for all filters, freezes filters and blocks duplicates", () => {
    const { fixture, viewer, reads, exports, exportAuditLogs, download, success } = setup()
    viewer.setFrom("2026-09-01")
    viewer.setTo("2026-09-02")
    selectActor(fixture, "2")
    viewer.setEntity("usuario")
    reads.next(Result.success(page()))
    reads.complete()
    viewer.exportCsv()
    viewer.exportCsv()
    viewer.selectActor("7")
    expect(viewer.selectedActor()?.id).toBe(2)
    viewer.clearFilters()
    viewer.removeFilter("fromUTC")
    viewer.setDay("2026-10-01")
    viewer.searchActors("otra")
    fixture.detectChanges()
    expect(viewer.filterModel().actorSearch).toBe("")
    expect(viewer.filters().fromUTC).toBe("2026-09-01")
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>("#audit-actor")
        ?.disabled
    ).toBe(true)
    expect(
      (fixture.nativeElement as HTMLElement).querySelector("#audit-actor")?.textContent
    ).toContain("ana@example.test")
    expect(viewer.filters().entity).toBe("usuario")
    expect(exportAuditLogs).toHaveBeenCalledOnce()
    expect(exportAuditLogs.mock.calls[0][0]).toEqual({
      dayUTC: undefined,
      fromUTC: "2026-09-01",
      toUTC: "2026-09-02",
      userId: 2,
      entity: "usuario"
    })
    expect(download).not.toHaveBeenCalled()
    const blob = new Blob(["CSV con más filas que la página"])
    exports.next(Result.success(blob))
    exports.complete()
    expect(download).toHaveBeenCalledExactlyOnceWith(blob)
    expect(success).toHaveBeenCalledExactlyOnceWith("Descarga de auditoría iniciada")
    expect(viewer.exporting()).toBe(false)
    fixture.destroy()
  })
  it("shows server limit feedback, never reports failed browser initiation, cancels late export", () => {
    const { fixture, viewer, reads, exports, exportAuditLogs, download, success } = setup()
    reads.next(Result.success(page()))
    reads.complete()
    viewer.exportCsv()
    exports.next(Result.failure(new AuditLogError("EXPORT_LIMIT")))
    exports.complete()
    expect(viewer.exportError()).toContain("10000")
    exportAuditLogs.mockReturnValue(of(Result.success(new Blob(["CSV"]))) as never)
    download.mockReturnValue(Result.failure(new AuditLogError("DOWNLOAD_FAILED")) as never)
    viewer.exportCsv()
    expect(viewer.exportError()).toContain("No se pudo iniciar")
    expect(success).not.toHaveBeenCalled()
    const late = new Subject<Result<Blob, AuditLogError>>()
    exportAuditLogs.mockReturnValue(late)
    download.mockClear()
    viewer.exportCsv()
    fixture.destroy()
    expect(late.observed).toBe(false)
    late.next(Result.success(new Blob(["CSV"])))
    expect(download).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })
})
