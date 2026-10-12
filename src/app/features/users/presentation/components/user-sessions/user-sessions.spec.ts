import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { firstValueFrom, of, Subject } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { USER_SESSION_REPOSITORY } from "../../../domain/repositories/user-session.repository"
import { UserSession } from "../../../domain/entities/user-session.entity"
import { UserSessionError } from "../../../domain/errors/user-session.error"
import { Lang, User } from "../../../domain/entities/user.entity"
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
const catalog = () =>
  Array.from({ length: 7 }, (_, i) =>
    User.create(
      842 + i,
      `Persona ${i}`,
      `persona${i}@example.test`,
      Lang.ES,
      true,
      new Date(),
      new Date(),
      1
    )
  )
describe("UserSessions grouped catalog", () => {
  let repository: { getUserSessions: ReturnType<typeof vi.fn> }
  const users = {
    users: signal(catalog()),
    loaded: signal(true),
    loading: signal(false),
    error: signal<unknown>(undefined)
  }
  beforeEach(() => {
    users.users.set(catalog())
    users.loaded.set(true)
    users.loading.set(false)
    users.error.set(undefined)
    repository = { getUserSessions: vi.fn(() => of(Result.success(sessions))) }
    TestBed.configureTestingModule({
      imports: [UserSessions],
      providers: [
        provideRouter([]),
        { provide: USER_SESSION_REPOSITORY, useValue: repository },
        { provide: UserStore, useValue: users },
        { provide: HotToastService, useValue: { success: vi.fn() } }
      ]
    })
  })
  async function setup() {
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadAllSessions())
    const fixture = TestBed.createComponent(UserSessions)
    fixture.detectChanges()
    return {
      store,
      fixture,
      component: fixture.componentInstance,
      element: fixture.nativeElement as HTMLElement
    }
  }
  function search(element: HTMLElement, text: string) {
    const input = element.querySelector<HTMLInputElement>('input[type="search"]')!
    input.value = text
    input.dispatchEvent(new Event("input"))
  }
  it("groups five users in native disclosures with server session metadata and actual guidance", async () => {
    const { element } = await setup()
    expect(element.querySelectorAll("details[data-session-user]")).toHaveLength(5)
    expect(element.querySelector("details > summary")).not.toBeNull()
    expect(element.querySelectorAll("article")).toHaveLength(2)
    expect(element.textContent).toContain("Sin sesiones")
    expect(element.textContent).toContain("Tu sesión actual")
    expect(element.textContent).toContain("Para cerrarla usa Salir")
    expect(element.textContent).toContain("Inicio · UTC")
    expect(element.querySelectorAll("article button")).toHaveLength(1)
    expect(element.querySelector("#session-user-id")).toBeNull()
  })
  it("searches name/email and filters presence locally, resets pages and never refetches or counts expiry", async () => {
    const { element, fixture, component, store } = await setup()
    component.goToPage(2)
    fixture.detectChanges()
    expect(element.querySelectorAll("details")).toHaveLength(2)
    search(element, "persona0@example.test")
    fixture.detectChanges()
    expect(element.querySelectorAll("details")).toHaveLength(1)
    expect(component.currentPage()).toBe(1)
    const select = element.querySelector<HTMLSelectElement>("select")!
    select.value = "without"
    select.dispatchEvent(new Event("change"))
    fixture.detectChanges()
    expect(element.querySelectorAll("details")).toHaveLength(0)
    select.value = "with"
    select.dispatchEvent(new Event("change"))
    fixture.detectChanges()
    expect(element.querySelectorAll("details")).toHaveLength(1)
    expect(store.sessionCount()).toBe(2)
    expect(repository.getUserSessions).toHaveBeenCalledOnce()
    component.clearFilters()
    component.goToPage(2)
    fixture.detectChanges()
    users.users.set(catalog().slice(0, 2))
    fixture.detectChanges()
    expect(component.currentPage()).toBe(1)
    component.goToPage(Number.NaN)
    expect(component.currentPage()).toBe(1)
  })
  it("retains real identities of session owners absent from users without technical disclosures", async () => {
    users.users.set(catalog().slice(1))
    const { element, store, component, fixture } = await setup()
    component.goToPage(2)
    fixture.detectChanges()
    expect(element.textContent).not.toContain("Catálogo incompleto")
    expect(element.textContent).not.toContain("Fuera del catálogo")
    expect(element.textContent).toContain("Usuario de sesión")
    expect(element.textContent).toContain("Persona del servidor")
    expect(store.sessionCount()).toBe(2)
  })
  it("never claims zero sessions during reads/errors or mistakes a failed catalog for empty", async () => {
    const { element, fixture, component } = await setup()
    repository.getUserSessions.mockReturnValue(new Subject())
    component.reload()
    fixture.detectChanges()
    expect(element.querySelector('[data-session-user="843"]')?.textContent).toContain(
      "Sesiones sin verificar"
    )
    repository.getUserSessions.mockReturnValue(of(Result.failure(new UserSessionError("NETWORK"))))
    component.reload()
    fixture.detectChanges()
    expect(element.textContent).toContain("No pudimos cargar las sesiones")
    expect(element.querySelector('[data-session-user="843"]')?.textContent).not.toContain(
      "Sin sesiones"
    )
    users.error.set(new Error())
    fixture.detectChanges()
    expect(element.textContent).toContain("No pudimos cargar el catálogo")
    users.error.set(undefined)
    users.loaded.set(false)
    users.loading.set(true)
    fixture.detectChanges()
    expect(element.textContent).toContain("Cargando usuarios")
  })
  it("cancels superseded reloads and component destruction without binding root lifetime", async () => {
    const { component, fixture, store } = await setup()
    const subject = new Subject()
    repository.getUserSessions.mockReturnValue(subject)
    component.reload()
    expect(subject.observed).toBe(true)
    component.reload()
    expect(subject.observers).toHaveLength(1)
    fixture.destroy()
    expect(subject.observed).toBe(false)
    repository.getUserSessions.mockReturnValue(of(Result.success(sessions)))
    await firstValueFrom(store.loadAllSessions())
    expect(store.loaded()).toBe(true)
  })
  it("opens guarded named confirmation, protects actual and suppresses late toast", async () => {
    const { component, fixture, element } = await setup()
    const open = vi
      .spyOn(TestBed.inject(HlmDialogService), "open")
      .mockReturnValue(undefined as never)
    const toast = TestBed.inject(HotToastService).success
    element.querySelector<HTMLButtonElement>("article button")!.click()
    expect(open.mock.calls[0][0]).toBe(RevokeSessionDialog)
    const options = open.mock.calls[0][1]!
    expect(options.disableClose).toBe(true)
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
})
