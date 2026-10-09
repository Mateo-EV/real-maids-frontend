import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { firstValueFrom, of } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { USER_REPOSITORY } from "../../../domain/repositories/user.repository"
import { USER_SESSION_REPOSITORY } from "../../../domain/repositories/user-session.repository"
import { UserSessionError } from "../../../domain/errors/user-session.error"
import { UserInMemorySource } from "../../../infrastructure/source/user-in-memory.source"
import { UserSessionRepositoryImpl } from "../../../infrastructure/repositories/user-session.repository-impl"
import { UserStore } from "../../state/user.store"
import { UserSessionsStore } from "../../state/user-sessions.store"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import {
  RevokeSessionContext,
  RevokeSessionDialog
} from "../revoke-session-dialog/revoke-session-dialog"
import { UserSessions } from "./user-sessions"

async function finish<T>(promise: Promise<T>) {
  await vi.advanceTimersByTimeAsync(250)
  return promise
}

describe("UserSessions", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    TestBed.configureTestingModule({
      imports: [UserSessions],
      providers: [
        provideRouter([]),
        { provide: USER_REPOSITORY, useExisting: UserInMemorySource },
        { provide: USER_SESSION_REPOSITORY, useExisting: UserSessionRepositoryImpl }
      ]
    })
  })
  afterEach(() => vi.useRealTimers())
  async function setup() {
    const users = TestBed.inject(UserStore),
      sessions = TestBed.inject(UserSessionsStore)
    await finish(firstValueFrom(users.loadUsers()))
    await finish(firstValueFrom(sessions.loadSessions()))
    const fixture = TestBed.createComponent(UserSessions)
    fixture.detectChanges()
    return {
      users,
      sessions,
      fixture,
      component: fixture.componentInstance,
      element: fixture.nativeElement as HTMLElement
    }
  }
  it("opts Sessions search and native filter into the shared catalog filter contract", async () => {
    const { element } = await setup()
    const row = element.querySelector(".catalog-filter-row")!
    expect(row).not.toBeNull()
    expect(
      row.querySelector(".catalog-filter-search > [data-slot='input-group'] #session-search")
    ).not.toBeNull()
    expect(
      row.querySelector(
        "[data-slot='native-select-wrapper'] > select#session-filter[data-slot='native-select']"
      )
    ).not.toBeNull()
    expect(element.querySelector('label[for="session-filter"]')?.textContent).toBe("Usuarios")
  })

  it("groups every catalog user once with native keyboard disclosure and no repeated profile metadata", async () => {
    const { element, component } = await setup()
    expect(element.querySelectorAll("details > summary")).toHaveLength(5)
    expect(component.rows().reduce((sum, row) => sum + row.sessions.length, 0)).toBe(6)
    expect(element.textContent).toContain("Sesión actual")
    expect(element.textContent).toContain("192.0.2.1")
    expect(element.textContent).toContain("Inicio · UTC")
    expect(element.textContent).toContain("Expira · UTC")
    expect(element.textContent).not.toMatch(/example.test|permisos|roles|demo|fictici|en memoria/i)
    const current = element.querySelector('details[data-session-user="1"] article')!
    expect(current.querySelector("button")).toBeNull()
    const zero = element.querySelector<HTMLDetailsElement>('details[data-session-user="5"]')!
    zero.open = true
    expect(zero.textContent).toContain("Sin sesiones activas")
    expect(zero.querySelector("summary")).not.toBeNull()
  })
  it("searches names and displayed IDs case-insensitively with trimmed queries before filtering and paging", async () => {
    const { component, fixture, element } = await setup()
    const input = element.querySelector<HTMLInputElement>("#session-search")!
    expect(element.querySelector('label[for="session-search"]')?.textContent).toContain(
      "Buscar nombre o ID"
    )
    input.value = "  CARLOS MENDOZA  "
    input.dispatchEvent(new Event("input"))
    fixture.detectChanges()
    expect(component.pagedRows().map(row => row.user.id)).toEqual([1])
    input.value = "  UsR-48  "
    input.dispatchEvent(new Event("input"))
    fixture.detectChanges()
    expect(component.pagedRows().map(row => row.user.id)).toEqual([48])
    component.filter.set("with")
    fixture.detectChanges()
    expect(element.textContent).toContain("Sin resultados")
    expect(element.textContent).toContain("Mostrando 0–0 de 0 usuarios")
    expect(element.querySelectorAll("details")).toHaveLength(0)
    expect(
      element.querySelector<HTMLButtonElement>('button[aria-label="Página siguiente"]')!.disabled
    ).toBe(true)
    component.filter.set("without")
    fixture.detectChanges()
    expect(component.pagedRows().map(row => row.user.id)).toEqual([48])
    component.search.set("inexistente")
    fixture.detectChanges()
    Array.from(element.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent?.includes("Mostrar todos"))!
      .click()
    fixture.detectChanges()
    expect(component.search()).toBe("")
    expect(component.filter()).toBe("all")
    expect(component.currentPage()).toBe(1)
    expect(element.querySelectorAll("details")).toHaveLength(5)
  })
  it("reaches all users including zero-session users through named pagination without slicing devices or the global count", async () => {
    const { component, fixture, element, sessions } = await setup()
    expect(
      element.querySelector('nav[aria-label="Paginación de usuarios en sesiones"]')
    ).not.toBeNull()
    expect(
      element.querySelector('details[data-session-user="1"]')!.querySelectorAll("article")
    ).toHaveLength(2)
    expect(element.textContent).toContain("Mostrando 1–5 de 48 usuarios")
    expect(
      element.querySelector<HTMLButtonElement>('button[aria-label="Página anterior"]')!.disabled
    ).toBe(true)
    const ids: number[] = []
    for (let page = 1; page <= component.pageCount(); page++) {
      component.goToPage(page)
      fixture.detectChanges()
      ids.push(
        ...Array.from(element.querySelectorAll("details")).map(row =>
          Number(row.getAttribute("data-session-user"))
        )
      )
    }
    expect(ids).toEqual(component.rows().map(row => row.user.id))
    expect(ids).toHaveLength(48)
    expect(element.textContent).toContain("Mostrando 46–48 de 48 usuarios")
    expect(
      element.querySelector<HTMLButtonElement>('button[aria-label="Página siguiente"]')!.disabled
    ).toBe(true)
    element.querySelector<HTMLButtonElement>('button[aria-label="Página anterior"]')!.click()
    fixture.detectChanges()
    expect(component.currentPage()).toBe(9)
    component.goToPage(999)
    expect(component.currentPage()).toBe(10)
    component.goToPage(-1)
    expect(component.currentPage()).toBe(1)
    component.goToPage(Number.NaN)
    expect(component.currentPage()).toBe(1)
    component.goToPage(8)
    component.search.set("USR-")
    expect(component.currentPage()).toBe(1)
    component.goToPage(8)
    component.filter.set("without")
    expect(component.currentPage()).toBe(1)
    expect(component.visibleRows()).toHaveLength(44)
    expect(sessions.activeSessions()).toHaveLength(6)
    expect(component.rows().reduce((sum, row) => sum + row.sessions.length, 0)).toBe(6)
  })
  it("clamps and retains the corrected page after catalog deletion, revoke and expiry", async () => {
    const { component, users, sessions } = await setup()
    component.goToPage(10)
    for (const id of [48, 47, 46]) await finish(firstValueFrom(users.deleteUserById(id)))
    expect(component.currentPage()).toBe(9)
    expect(component.pagedRows()).toHaveLength(5)
    component.filter.set("without")
    component.goToPage(9)
    expect(component.pagedRows()).toHaveLength(1)
    await finish(firstValueFrom(users.deleteUserById(45)))
    expect(component.currentPage()).toBe(8)
    // Revoke adds a user to this filter; the clamped page must not spring back.
    await finish(firstValueFrom(sessions.revokeSession(2, 3)))
    expect(component.currentPage()).toBe(8)
    expect(component.pageCount()).toBe(9)
    component.filter.set("with")
    component.search.set("USR-2")
    expect(component.visibleRows()).toHaveLength(0)
    component.search.set("")
    vi.setSystemTime(Math.max(...sessions.sessions().map(session => session.expiryDate.getTime())))
    sessions.refreshClock()
    expect(component.currentPage()).toBe(1)
    expect(component.visibleRows()).toHaveLength(0)
    expect(component.rangeStart()).toBe(0)
    expect(component.rangeEnd()).toBe(0)
  })
  it("clamps a sessions-only last page when revoke or expiry removes its user row", async () => {
    const { component, sessions, fixture, element } = await setup()
    const repository = TestBed.inject(USER_SESSION_REPOSITORY)
    const now = Date.now()
    const records = [
      ...sessions.sessions(),
      { ...sessions.sessions()[0], id: 100, userId: 5, isCurrent: false },
      {
        ...sessions.sessions()[0],
        id: 101,
        userId: 6,
        isCurrent: false,
        expiryDate: new Date(now + 1000)
      }
    ]
    vi.spyOn(repository, "getUserSessions").mockReturnValue(of(Result.success(records)))
    await firstValueFrom(sessions.loadSessions())
    component.filter.set("with")
    component.goToPage(2)
    expect(component.pagedRows().map(row => row.user.id)).toEqual([6])
    await finish(firstValueFrom(sessions.revokeSession(2, 3)))
    fixture.detectChanges()
    expect(component.currentPage()).toBe(1)
    expect(element.textContent).toContain("Mostrando 1–5 de 5 usuarios")
    await firstValueFrom(sessions.loadSessions())
    expect(component.currentPage()).toBe(1)
    component.goToPage(2)
    vi.setSystemTime(now + 1000)
    sessions.refreshClock()
    fixture.detectChanges()
    expect(component.currentPage()).toBe(1)
    expect(element.querySelectorAll("details")).toHaveLength(5)
    expect(component.visibleRows().some(row => row.user.id === 6)).toBe(false)
  })
  it("retains only catalog users, updates filters/counts after revoke and expiry", async () => {
    const { component, sessions, users } = await setup()
    component.filter.set("with")
    expect(component.visibleRows()).toHaveLength(4)
    await finish(firstValueFrom(sessions.revokeSession(2, 3)))
    expect(component.visibleRows()).toHaveLength(3)
    component.filter.set("without")
    expect(component.visibleRows()).toHaveLength(45)
    await finish(firstValueFrom(users.deleteUserById(1)))
    expect(component.rows()).toHaveLength(47)
    expect(component.rows().some(row => row.user.id === 1)).toBe(false)
    vi.setSystemTime(Math.max(...sessions.sessions().map(session => session.expiryDate.getTime())))
    sessions.refreshClock()
    expect(component.visibleRows()).toHaveLength(47)
    component.filter.set("with")
    expect(component.visibleRows()).toHaveLength(0)
  })
  it("opens individual guarded confirmation and suppresses feedback after destruction", async () => {
    const { component, fixture, element } = await setup()
    const dialogs = vi
      .spyOn(TestBed.inject(HlmDialogService), "open")
      .mockReturnValue(undefined as never)
    const toast = vi.spyOn(TestBed.inject(HotToastService), "success")
    element
      .querySelector<HTMLButtonElement>('button[aria-label^="Cerrar sesión de Carlos"]')!
      .click()
    expect(dialogs.mock.calls[0][0]).toBe(RevokeSessionDialog)
    const options = dialogs.mock.calls[0][1]!
    expect(options.disableClose).toBe(true)
    expect(options.showCloseButton).toBe(false)
    const context = options.context as RevokeSessionContext
    expect(context.user.id).toBe(1)
    expect(context.session.id).toBe(2)
    expect(toast).not.toHaveBeenCalled()
    context.onRevoked()
    expect(toast).toHaveBeenCalledExactlyOnceWith("Sesión de Carlos Mendoza cerrada")
    component.revoke(context.user, component.rows()[0].sessions[0])
    expect(dialogs).toHaveBeenCalledOnce()
    fixture.destroy()
    toast.mockClear()
    context.onRevoked()
    expect(toast).not.toHaveBeenCalled()
  })
  it("renders loading, typed error/retry and empty filter states", async () => {
    const { fixture, component, sessions, element } = await setup()
    const request = sessions.loadSessions().subscribe()
    fixture.detectChanges()
    expect(element.textContent).toContain("Cargando sesiones")
    request.unsubscribe()
    const repository = TestBed.inject(USER_SESSION_REPOSITORY)
    vi.spyOn(repository, "getUserSessions").mockReturnValue(
      of(Result.failure(new UserSessionError("UNEXPECTED")))
    )
    await firstValueFrom(sessions.loadSessions())
    fixture.detectChanges()
    expect(element.textContent).toContain("No pudimos cargar las sesiones")
    const retry = vi.fn()
    component.retry.subscribe(retry)
    Array.from(element.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent?.includes("Reintentar"))!
      .click()
    expect(retry).toHaveBeenCalledOnce()
    vi.mocked(repository.getUserSessions).mockReturnValue(of(Result.success([])))
    await firstValueFrom(sessions.loadSessions())
    component.filter.set("with")
    fixture.detectChanges()
    expect(element.textContent).toContain("Sin resultados")
  })
})
