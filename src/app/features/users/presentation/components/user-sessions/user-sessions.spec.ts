import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { firstValueFrom, of, Subject } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { USER_SESSION_REPOSITORY } from "../../../domain/repositories/user-session.repository"
import { UserSession } from "../../../domain/entities/user-session.entity"
import { UserSessionError } from "../../../domain/errors/user-session.error"
import { UserSessionsStore } from "../../state/user-sessions.store"
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
    new Date("2026-01-01T10:00:00Z"),
    new Date("2027-01-01T10:00:00Z"),
    actual,
    "Persona del servidor",
    "real@example.test"
  )
)
const page = { items: sessions, page: 0, size: 20, total: 42, totalPages: 3 }
describe("UserSessions", () => {
  let repository: { getUserSessions: ReturnType<typeof vi.fn> }
  beforeEach(() => {
    repository = { getUserSessions: vi.fn(() => of(Result.success(page))) }
    TestBed.configureTestingModule({
      imports: [UserSessions],
      providers: [
        provideRouter([]),
        { provide: USER_SESSION_REPOSITORY, useValue: repository },
        { provide: HotToastService, useValue: { success: vi.fn() } }
      ]
    })
  })
  async function setup() {
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadSessions())
    const fixture = TestBed.createComponent(UserSessions)
    fixture.detectChanges()
    return {
      store,
      fixture,
      component: fixture.componentInstance,
      element: fixture.nativeElement as HTMLElement
    }
  }
  it("uses DTO owner data independently of the currently loaded user catalog and displays server totals", async () => {
    const { element } = await setup()
    expect(element.querySelectorAll("article")).toHaveLength(2)
    expect(element.textContent).toContain("Persona del servidor · #USR-842")
    expect(element.textContent).toContain("Mostrando 1–2 de 42 sesiones")
    expect(element.textContent).toContain("Tu sesión actual")
    expect(element.textContent).toContain("Para cerrarla usa Salir")
    expect(element.textContent).toContain("Inicio · UTC")
    expect(element.querySelectorAll("article button")).toHaveLength(1)
    expect(element.querySelector('nav[aria-label="Paginación de sesiones"]')).not.toBeNull()
  })
  it("queries only documented user ID and server pagination; rejects invalid IDs", async () => {
    const { component, fixture } = await setup()
    component.model.set({ userId: "842" })
    component.applyFilters()
    expect(repository.getUserSessions).toHaveBeenLastCalledWith({ page: 0, size: 20, userId: 842 })
    component.goToPage(2)
    expect(repository.getUserSessions).toHaveBeenLastCalledWith({ page: 1, size: 20, userId: 842 })
    component.model.set({ userId: "no-id" })
    fixture.detectChanges()
    const calls = repository.getUserSessions.mock.calls.length
    component.applyFilters()
    expect(repository.getUserSessions).toHaveBeenCalledTimes(calls)
    component.clearFilters()
    expect(repository.getUserSessions).toHaveBeenLastCalledWith({ page: 0, size: 20 })
    component.goToPage(Number.NaN)
    expect(repository.getUserSessions).toHaveBeenCalledTimes(calls + 1)
  })
  it("cancels superseded queries and cancels component-owned work at destruction", async () => {
    const { component, fixture } = await setup()
    const cancelled = vi.fn()
    const subject = new Subject()
    const original = subject.subscribe.bind(subject)
    vi.spyOn(subject, "subscribe").mockImplementation(
      (...args: Parameters<typeof subject.subscribe>) => {
        const subscription = original(...args)
        subscription.add(cancelled)
        return subscription
      }
    )
    repository.getUserSessions.mockReturnValue(subject)
    component.reload()
    component.goToPage(2)
    expect(cancelled).toHaveBeenCalledOnce()
    fixture.destroy()
    expect(cancelled).toHaveBeenCalledTimes(2)
  })
  it("opens named guarded confirmation, protects actual and suppresses feedback after destruction", async () => {
    const { component, fixture, element } = await setup()
    const open = vi
      .spyOn(TestBed.inject(HlmDialogService), "open")
      .mockReturnValue(undefined as never)
    const toast = TestBed.inject(HotToastService).success
    element.querySelector<HTMLButtonElement>("article button")!.click()
    expect(open.mock.calls[0][0]).toBe(RevokeSessionDialog)
    const options = open.mock.calls[0][1]!
    expect(options.disableClose).toBe(true)
    expect(options.showCloseButton).toBe(false)
    const context = options.context as RevokeSessionContext
    expect(context.user).toEqual({ id: 842, name: "Persona del servidor" })
    context.onRevoked()
    expect(toast).toHaveBeenCalledOnce()
    component.revoke(sessions[0])
    expect(open).toHaveBeenCalledOnce()
    fixture.destroy()
    context.onRevoked()
    expect(toast).toHaveBeenCalledOnce()
  })
  it("renders loading, safe errors/retry and authoritative empty results", async () => {
    const { component, fixture, element } = await setup()
    repository.getUserSessions.mockReturnValue(new Subject())
    component.reload()
    fixture.detectChanges()
    expect(element.textContent).toContain("Cargando sesiones")
    repository.getUserSessions.mockReturnValue(
      of(Result.failure(new UserSessionError("FORBIDDEN")))
    )
    component.reload()
    fixture.detectChanges()
    expect(element.textContent).toContain("No pudimos cargar las sesiones")
    repository.getUserSessions.mockReturnValue(
      of(Result.success({ ...page, items: [], total: 0, totalPages: 0 }))
    )
    Array.from(element.querySelectorAll<HTMLButtonElement>("button"))
      .find(b => b.textContent?.includes("Reintentar"))!
      .click()
    fixture.detectChanges()
    expect(element.textContent).toContain("Sin sesiones activas")
    expect(element.textContent).toContain("Mostrando 0–0 de 0 sesiones")
  })
})
