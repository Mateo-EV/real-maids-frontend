import { signal } from "@angular/core"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { EMPTY } from "rxjs"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { firstValueFrom, of, Subject } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { USER_SESSION_REPOSITORY } from "../../../domain/repositories/user-session.repository"
import { UserSession } from "../../../domain/entities/user-session.entity"
import { UserSessionError } from "../../../domain/errors/user-session.error"
import { UserSessionsStore } from "../../state/user-sessions.store"
import { UserStore } from "../../state/user.store"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import {
  RevokeSessionContext,
  RevokeSessionDialog
} from "../revoke-session-dialog/revoke-session-dialog"
import { UserSessions } from "./user-sessions"

const sessions = [true, false].map((actual, index) =>
  UserSession.create(
    71 + index,
    842,
    "192.0.2.1",
    "Navegador",
    new Date("2025-01-01T10:00:00Z"),
    new Date("2025-02-01T10:00:00Z"),
    actual,
    "Persona del servidor",
    "real@example.test"
  )
)
const owners = Array.from({ length: 5 }, (_, i) => ({
  id: 842 + i,
  name: `Persona ${i}`,
  email: `persona${i}@example.test`,
  sessionCount: i === 0 ? 9 : 0
}))
const page = { items: owners, total: 7, offset: 0, limit: 5 }
describe("UserSessions server owners and disclosure details", () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>
  beforeEach(() => {
    repository = {
      getSessionOwners: vi.fn(() => of(Result.success(page))),
      getSessionCount: vi.fn(() => of(Result.success(1007))),
      getUserSessionsByUser: vi.fn(() => of(Result.success(sessions))),
      revokeUserSession: vi.fn(() => of(Result.success(undefined))),
      revokeUserSessions: vi.fn(() => of(Result.success(undefined)))
    }
    TestBed.configureTestingModule({
      imports: [UserSessions],
      providers: [
        provideRouter([]),
        {
          provide: AuthStore,
          useValue: {
            session: signal(AuthSession.create("Test", "test@example.test", null, null, 1))
          }
        },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } },
        { provide: USER_SESSION_REPOSITORY, useValue: repository },
        { provide: UserStore, useValue: { mutationRevision: () => 0 } },
        { provide: HotToastService, useValue: { success: vi.fn() } }
      ]
    })
  })
  function setup() {
    const fixture = TestBed.createComponent(UserSessions)
    fixture.detectChanges()
    return {
      fixture,
      component: fixture.componentInstance,
      element: fixture.nativeElement as HTMLElement,
      store: TestBed.inject(UserSessionsStore)
    }
  }
  function open(element: HTMLElement, id = 842) {
    const details = element.querySelector<HTMLDetailsElement>(`[data-session-user="${id}"]`)!
    details.open = true
    details.dispatchEvent(new Event("toggle"))
    return details
  }
  it("renders server summaries without initial per-owner or global-array reads; only explicit open loads detail", () => {
    const { element, fixture } = setup()
    expect(element.querySelectorAll("details")).toHaveLength(5)
    expect(element.querySelector("summary")?.textContent).toContain("9 sesiones")
    expect(element.querySelectorAll("article")).toHaveLength(0)
    expect(repository["getUserSessionsByUser"]).not.toHaveBeenCalled()
    open(element)
    fixture.detectChanges()
    expect(repository["getUserSessionsByUser"]).toHaveBeenCalledExactlyOnceWith(842)
    expect(element.querySelectorAll("article")).toHaveLength(2)
    expect(element.textContent).toContain("Tu sesión actual")
    expect(element.textContent).toContain("Para cerrarla usa Salir")
    expect(element.querySelector("summary")?.textContent).toContain("9 sesiones")
  })
  it("debounces name/email server search, resets page, and emits false presence rather than omitting it", async () => {
    vi.useFakeTimers()
    try {
      const { component, fixture } = setup()
      component.setSearch("Ana")
      expect(repository["getSessionOwners"]).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(250)
      expect(repository["getSessionOwners"]).toHaveBeenLastCalledWith({
        offset: 0,
        limit: 5,
        search: "Ana"
      })
      component.setPresence("without")
      expect(repository["getSessionOwners"]).toHaveBeenLastCalledWith({
        offset: 0,
        limit: 5,
        search: "Ana",
        hasSessions: false
      })
      component.clearFilters()
      expect(repository["getSessionOwners"]).toHaveBeenLastCalledWith({ offset: 0, limit: 5 })
      expect(repository["getUserSessionsByUser"]).not.toHaveBeenCalled()
      fixture.destroy()
    } finally {
      vi.useRealTimers()
    }
  })
  it("uses effective sizes for navigation without slicing returned rows", () => {
    repository["getSessionOwners"].mockReturnValueOnce(
      of(Result.success({ ...page, limit: 2, items: owners.slice(0, 2) }))
    )
    const { component, element } = setup()
    expect(element.querySelectorAll("details")).toHaveLength(2)
    component.goToPage(2)
    expect(repository["getSessionOwners"]).toHaveBeenLastCalledWith({ offset: 2, limit: 2 })
    component.goToPage(Number.NaN)
    expect(repository["getSessionOwners"]).toHaveBeenCalledTimes(2)
  })
  it("keeps detail failure separate from valid summaries; row retry never replays writes", () => {
    repository["getUserSessionsByUser"].mockReturnValueOnce(
      of(Result.failure(new UserSessionError("FORBIDDEN")))
    )
    const { element, fixture, component } = setup()
    open(element)
    fixture.detectChanges()
    expect(element.textContent).toContain("No pudimos cargar las conexiones")
    expect(element.querySelector("summary")?.textContent).toContain("9 sesiones")
    component.refreshDetail(842)
    fixture.detectChanges()
    expect(element.querySelectorAll("article")).toHaveLength(2)
    expect(repository["getSessionOwners"]).toHaveBeenCalledOnce()
    expect(repository["revokeUserSession"]).not.toHaveBeenCalled()
  })
  it("hides failed/unverified summaries, retries independently and cancels all owned reads on destroy", () => {
    const { element, fixture, component } = setup()
    const detail = new Subject(),
      summary = new Subject()
    repository["getUserSessionsByUser"].mockReturnValue(detail)
    open(element)
    repository["getSessionOwners"].mockReturnValue(summary)
    component.reload()
    fixture.detectChanges()
    expect(element.querySelectorAll("summary")).toHaveLength(0)
    fixture.destroy()
    expect(detail.observed).toBe(false)
    expect(summary.observed).toBe(false)
  })
  it("refreshes active owner page and affected open detail once per confirmed mutation, never count here", async () => {
    const { element, fixture, store } = setup()
    open(element)
    fixture.detectChanges()
    await firstValueFrom(store.revokeSession(842, 72))
    fixture.detectChanges()
    expect(repository["getSessionOwners"]).toHaveBeenCalledTimes(2)
    expect(repository["getUserSessionsByUser"]).toHaveBeenCalledTimes(2)
    expect(repository["getSessionCount"]).not.toHaveBeenCalled()
    expect(repository["revokeUserSession"]).toHaveBeenCalledOnce()
  })
  it("shows summary failures instead of a false empty page and retries the same query", () => {
    repository["getSessionOwners"].mockReturnValueOnce(
      of(Result.failure(new UserSessionError("FORBIDDEN")))
    )
    const { element, fixture, component } = setup()
    expect(element.textContent).toContain("No pudimos cargar los usuarios con sesiones")
    expect(element.textContent).not.toContain("Sin usuarios para estos filtros")
    expect(repository["getUserSessionsByUser"]).not.toHaveBeenCalled()
    component.reload()
    fixture.detectChanges()
    expect(element.querySelectorAll("summary")).toHaveLength(5)
  })
  it("cancels closed disclosures, never reads closed owners on mutation and revalidates on reopen", async () => {
    const { element, fixture, store } = setup()
    const pending = new Subject()
    repository["getUserSessionsByUser"].mockReturnValueOnce(pending)
    const details = open(element)
    fixture.detectChanges()
    details.open = false
    details.dispatchEvent(new Event("toggle"))
    expect(pending.observed).toBe(false)
    await firstValueFrom(store.revokeSessions(842))
    fixture.detectChanges()
    expect(repository["getUserSessionsByUser"]).toHaveBeenCalledOnce()
    open(element)
    fixture.detectChanges()
    expect(repository["getUserSessionsByUser"]).toHaveBeenCalledTimes(2)
    expect(element.querySelectorAll("article")).toHaveLength(2)
  })
  it("keeps confirmed writes successful despite failed owner/detail refresh, without replay", async () => {
    const { element, fixture, store } = setup()
    open(element)
    fixture.detectChanges()
    repository["getSessionOwners"].mockReturnValueOnce(
      of(Result.failure(new UserSessionError("NETWORK")))
    )
    repository["getUserSessionsByUser"].mockReturnValueOnce(
      of(Result.failure(new UserSessionError("NETWORK")))
    )
    expect((await firstValueFrom(store.revokeSession(842, 72))).success).toBe(true)
    fixture.detectChanges()
    expect(element.textContent).toContain("No pudimos cargar los usuarios con sesiones")
    expect(store.details()[842].loaded).toBe(false)
    expect(store.details()[842].error?.code).toBe("NETWORK")
    expect(repository["revokeUserSession"]).toHaveBeenCalledOnce()
    expect(repository["getSessionOwners"]).toHaveBeenCalledTimes(2)
    expect(repository["getUserSessionsByUser"]).toHaveBeenCalledTimes(2)
  })
  it("selects shared root owners while independent component controls cancel only their own activity", async () => {
    vi.useFakeTimers()
    try {
      const pending = new Subject()
      repository["getSessionOwners"].mockReturnValueOnce(pending)
      const first = setup(),
        second = setup()
      expect(first.component.sessions).toBe(second.component.sessions)
      expect(repository["getSessionOwners"]).toHaveBeenCalledOnce()
      expect(first.component.owners.loading()).toBe(true)
      expect(second.component.owners.loading()).toBe(true)
      first.component.setSearch("Other")
      expect(pending.observed).toBe(true)
      pending.next(Result.success(page))
      pending.complete()
      first.fixture.detectChanges()
      second.fixture.detectChanges()
      expect(first.component.visibleUsers()).toEqual([])
      expect(second.component.visibleUsers()).toEqual(owners)
      await vi.advanceTimersByTimeAsync(250)
      expect(repository["getSessionOwners"]).toHaveBeenLastCalledWith({
        offset: 0,
        limit: 5,
        search: "Other"
      })
      expect(first.component.owners.query().search).toBe("Other")
      expect(second.component.owners.query().search).toBeUndefined()
      first.fixture.destroy()
      expect(second.component.owners.loaded()).toBe(true)
      expect(Object.keys(second.store.ownerEntries())).toHaveLength(1)
      second.fixture.destroy()
      expect(second.store.ownerEntries()).toEqual({})
      expect(repository["getUserSessionsByUser"]).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("opens guarded named confirmation, protects actual and suppresses late toast", () => {
    const { element, component, fixture } = setup()
    open(element)
    fixture.detectChanges()
    const dialog = vi
      .spyOn(TestBed.inject(HlmDialogService), "open")
      .mockReturnValue(undefined as never)
    element.querySelector<HTMLButtonElement>("article button")!.click()
    expect(dialog.mock.calls[0][0]).toBe(RevokeSessionDialog)
    const options = dialog.mock.calls[0][1]!
    expect(options.disableClose).toBe(true)
    const context = options.context as RevokeSessionContext
    expect(context.user).toEqual({ id: 842, name: "Persona del servidor" })
    context.onRevoked()
    const toast = TestBed.inject(HotToastService).success
    expect(toast).toHaveBeenCalledOnce()
    component.revoke(sessions[0])
    expect(dialog).toHaveBeenCalledOnce()
    fixture.destroy()
    context.onRevoked()
    expect(toast).toHaveBeenCalledOnce()
  })
})
