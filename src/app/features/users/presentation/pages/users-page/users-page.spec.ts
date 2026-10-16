/// <reference types="node" />
import { readFileSync } from "node:fs"
import { signal } from "@angular/core"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { UserRepositoryImpl } from "../../../infrastructure/repositories/user.repository-impl"
import { DeferBlockBehavior, TestBed } from "@angular/core/testing"
import { By } from "@angular/platform-browser"
import { RbacMatrix } from "../../components/rbac-matrix/rbac-matrix"
import { AuditViewer } from "../../components/audit-viewer/audit-viewer"
import { RbacError } from "../../../domain/errors/rbac.error"
import { AuditLogError } from "../../../domain/errors/audit-log.error"
import { provideRouter } from "@angular/router"
import { firstValueFrom, of, Subject, timer, map } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserError } from "../../../domain/errors/user.error"
import { UserSession } from "../../../domain/entities/user-session.entity"
import { AuditLog } from "../../../domain/entities/audit-log.entity"
import { AuditQuery } from "../../../domain/models/audit-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { UserStore } from "../../state/user.store"
import { RolesStore } from "../../state/roles.store"
import { USER_REPOSITORY } from "../../../domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "../../../domain/repositories/role.repository"
import { UserInMemorySource } from "../../../infrastructure/source/user-in-memory.source"
import { RoleInMemorySource } from "../../../infrastructure/source/role-in-memory.source"
import { UsersPage } from "./users-page"
import { USER_SESSION_REPOSITORY } from "../../../domain/repositories/user-session.repository"
import { UserSessionRepositoryImpl } from "../../../infrastructure/repositories/user-session.repository-impl"
import { AUDIT_LOG_REPOSITORY } from "../../../domain/repositories/audit-log.repository"
import { AuditLogRepositoryImpl } from "../../../infrastructure/repositories/audit-log.repository-impl"
import { RBAC_REPOSITORY } from "../../../domain/repositories/rbac.repository"
import { RbacRepositoryImpl } from "../../../infrastructure/repositories/rbac.repository-impl"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import {
  UserStatusContext,
  UserStatusDialog
} from "../../components/user-status-dialog/user-status-dialog"

const providers = [
  { provide: USER_REPOSITORY, useExisting: UserInMemorySource },
  { provide: ROLE_REPOSITORY, useExisting: RoleInMemorySource },
  { provide: USER_SESSION_REPOSITORY, useExisting: UserSessionRepositoryImpl },
  { provide: RBAC_REPOSITORY, useExisting: RbacRepositoryImpl },
  { provide: AUDIT_LOG_REPOSITORY, useExisting: AuditLogRepositoryImpl }
]

async function flush<T>(pending: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(750)
  return pending
}

describe("UsersPage", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UsersPage],
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
      providers: [
        ...providers,
        provideRouter([]),
        {
          provide: AuthStore,
          useValue: {
            session: signal({ name: "Actual identity", email: "identity@example.test" }),
            logout: vi.fn()
          }
        }
      ]
    })
    TestBed.overrideProvider(USER_SESSION_REPOSITORY, {
      useValue: {
        getUserSessions: () =>
          timer(250).pipe(
            map(() =>
              Result.success(
                Array.from({ length: 26 }, (_, index) =>
                  UserSession.create(
                    index + 1,
                    90,
                    "192.0.2.1",
                    "Chrome",
                    new Date("2026-01-01T00:00:00Z"),
                    new Date("2027-01-01T00:00:00Z"),
                    index === 0,
                    "Server user",
                    "server@example.test"
                  )
                )
              )
            )
          ),
        revokeUserSession: () => timer(250).pipe(map(() => Result.success<void>(undefined))),
        revokeUserSessions: vi.fn(),
        getUserSessionsByUser: vi.fn()
      }
    })
    TestBed.overrideProvider(AUDIT_LOG_REPOSITORY, {
      useValue: {
        getAuditLogs: (query: AuditQuery = {}) =>
          timer(250).pipe(
            map(() => {
              const page = query.page ?? 0,
                size = query.size ?? 20,
                total = query.entity ? 9 : 48
              const items = Array.from(
                { length: Math.min(size, Math.max(0, total - page * size)) },
                (_, index) =>
                  AuditLog.create(
                    page * size + index + 1,
                    90,
                    query.entity ?? "usuario",
                    "ACTUALIZAR",
                    "Server event",
                    "192.0.2.1",
                    new Date("2026-09-01T00:00:00Z"),
                    "Server actor",
                    "42"
                  )
              )
              return Result.success({
                items,
                page,
                size,
                total,
                totalPages: Math.ceil(total / size),
                globalTotal: 90
              })
            })
          ),
        getAuditLogById: vi.fn(),
        exportAuditLogs: vi.fn()
      }
    })
    TestBed.overrideProvider(AuditLogRepositoryImpl, {
      useFactory: () => TestBed.inject(AUDIT_LOG_REPOSITORY)
    })
    TestBed.overrideProvider(RBAC_REPOSITORY, {
      useValue: {
        getPermissions: () =>
          timer(250).pipe(
            map(() =>
              Result.success([
                { id: 73, code: "CUSTOM", module: "Backend", description: "Custom permission" }
              ])
            )
          ),
        getRolePermissions: (roleId: number) =>
          timer(250).pipe(map(() => Result.success({ roleId, permissions: [] }))),
        saveRolePermissions: vi.fn()
      }
    })
    TestBed.overrideProvider(RbacRepositoryImpl, {
      useFactory: () => TestBed.inject(RBAC_REPOSITORY)
    })
  })
  async function setup() {
    const fixture = TestBed.createComponent(UsersPage)
    fixture.detectChanges()
    await flush(fixture.whenStable())
    fixture.detectChanges()
    return {
      fixture,
      page: fixture.componentInstance,
      users: TestBed.inject(UserStore),
      roles: TestBed.inject(RolesStore),
      element: fixture.nativeElement as HTMLElement
    }
  }

  it("enables Audit and keeps its filtered count separate from the global source metric", async () => {
    const { fixture, element, page } = await setup()
    const audit = element.querySelector<HTMLButtonElement>("[data-audit-tab]")!
    expect(audit).not.toBeNull()
    expect(audit.disabled).toBe(false)
    await visit(fixture, "audit")
    await flush(fixture.whenStable())
    fixture.detectChanges()
    expect(element.querySelector("app-audit-viewer")).not.toBeNull()
    expect(element.querySelector("[data-audit-metric]")?.textContent?.trim()).toBe("90")
    const entity = element.querySelector<HTMLSelectElement>("#audit-entity")!
    entity.value = "sesion"
    entity.dispatchEvent(new Event("change"))
    await flush(fixture.whenStable())
    fixture.detectChanges()
    expect(element.textContent).toContain("de 9 registros")
    expect(element.querySelector("[data-audit-metric]")?.textContent?.trim()).toBe("90")
    page.section.set("users")
    fixture.detectChanges()
    expect(element.querySelector("#user-search")).not.toBeNull()
    expect(element.querySelector("app-audit-viewer")?.parentElement?.hidden).toBe(true)
  })

  async function visit(
    fixture: ReturnType<typeof TestBed.createComponent<UsersPage>>,
    section: "users" | "rbac" | "audit"
  ) {
    const element = fixture.nativeElement as HTMLElement
    element.querySelector<HTMLButtonElement>(`[data-${section}-tab]`)!.click()
    fixture.detectChanges()
    // Let deferred dependencies resolve naturally; never force a block's rendered state.
    await vi.advanceTimersByTimeAsync(0)
    fixture.detectChanges()
    if (
      section !== "users" &&
      !(
        section === "rbac" &&
        (fixture.componentInstance.initializing() || fixture.componentInstance.loadError())
      )
    ) {
      await vi.waitFor(
        () => {
          fixture.detectChanges()
          expect(
            element.querySelector(section === "rbac" ? "app-rbac-matrix" : "app-audit-viewer")
          ).not.toBeNull()
        },
        { interval: 1 }
      )
    }
  }

  it("loads RBAC only on first visit and retains the role and unsaved draft without reloading", async () => {
    const query = vi.spyOn(TestBed.inject(RbacRepositoryImpl), "getRolePermissions")
    const { fixture, element } = await setup()
    expect(query).not.toHaveBeenCalled()
    expect(element.querySelector("app-rbac-matrix")).toBeNull()
    await visit(fixture, "audit")
    expect(query).not.toHaveBeenCalled()
    await visit(fixture, "rbac")
    const matrix = fixture.debugElement.query(By.directive(RbacMatrix))
      .componentInstance as RbacMatrix
    expect(matrix.loading()).toBe(true)
    await vi.advanceTimersByTimeAsync(500)
    matrix.selectRole("1")
    await vi.advanceTimersByTimeAsync(500)
    matrix.toggle(73, true)
    fixture.detectChanges()
    expect(matrix.dirty()).toBe(true)
    const draft = matrix.ids()
    await visit(fixture, "users")
    const wrapper = element.querySelector("app-rbac-matrix")?.parentElement
    expect(wrapper?.hidden).toBe(true)
    expect(wrapper?.style.display).toBe("none")
    expect(wrapper?.hasAttribute("inert")).toBe(true)
    await visit(fixture, "rbac")
    expect(fixture.debugElement.query(By.directive(RbacMatrix)).componentInstance).toBe(matrix)
    expect(matrix.selectedRoleId()).toBe(1)
    expect(matrix.ids()).toEqual(draft)
    expect(matrix.canSave()).toBe(true)
    expect(matrix.loading()).toBe(false)
    expect(query).toHaveBeenCalledTimes(2) // first visit and explicit role change only
    expect(wrapper?.hidden).toBe(false)
    expect(wrapper?.style.display).toBe("")
    expect(wrapper?.hasAttribute("inert")).toBe(false)
  })

  it("loads Audit only on first visit and retains filters, page and rows without another query", async () => {
    // jsdom has no overlay geometry; stub only the browser APIs this interaction needs.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    const query = vi.spyOn(TestBed.inject(AuditLogRepositoryImpl), "getAuditLogs")
    const { fixture, element } = await setup()
    const globalCalls = query.mock.calls.length // the independent global metric query is allowed
    expect(element.querySelector("app-audit-viewer")).toBeNull()
    await visit(fixture, "rbac")
    expect(query).toHaveBeenCalledTimes(globalCalls)
    await visit(fixture, "audit")
    await flush(fixture.whenStable())
    const viewer = fixture.debugElement.query(By.directive(AuditViewer))
      .componentInstance as AuditViewer
    const entity = element.querySelector<HTMLSelectElement>("#audit-entity")!
    entity.value = "sesion"
    entity.dispatchEvent(new Event("change"))
    await flush(fixture.whenStable())
    fixture.detectChanges()
    element
      .querySelector<HTMLButtonElement>('app-audit-viewer button[aria-label="Página siguiente"]')!
      .click()
    await flush(fixture.whenStable())
    fixture.detectChanges()
    const actor = element.querySelector<HTMLButtonElement>("#audit-actor")!
    expect(actor.getAttribute("role")).toBe("combobox")
    const callsBeforeOpening = query.mock.calls.length
    actor.click()
    await flush(fixture.whenStable())
    fixture.detectChanges()
    expect(query).toHaveBeenCalledTimes(callsBeforeOpening)
    const option = Array.from(
      document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]')
    ).find(item => item.textContent?.includes("(USR-1)"))!
    expect(option).toBeDefined()
    option.scrollIntoView = vi.fn()
    option.click()
    await flush(fixture.whenStable())
    fixture.detectChanges()
    expect(viewer.filters()).toEqual({ entity: "sesion", userId: 1 })
    const actorLabel = actor.textContent
    expect(actorLabel).toContain("(USR-1)")
    viewer.goToPage(2)
    await flush(fixture.whenStable())
    fixture.detectChanges()
    const rows = element.querySelector("app-audit-viewer tbody")!.textContent
    const calls = query.mock.calls.length
    expect(viewer.page()).toBe(2)
    await visit(fixture, "users")
    const wrapper = element.querySelector("app-audit-viewer")?.parentElement
    expect(wrapper?.hidden).toBe(true)
    expect(wrapper?.style.display).toBe("none")
    expect(wrapper?.hasAttribute("inert")).toBe(true)
    await visit(fixture, "audit")
    expect(fixture.debugElement.query(By.directive(AuditViewer)).componentInstance).toBe(viewer)
    expect(viewer.filters()).toEqual({ entity: "sesion", userId: 1 })
    expect(element.querySelector<HTMLButtonElement>("#audit-actor")!.textContent).toBe(actorLabel)
    expect(viewer.selectedActor()?.id).toBe(1)
    expect(viewer.page()).toBe(2)
    expect(element.querySelector("app-audit-viewer tbody")!.textContent).toBe(rows)
    expect(query).toHaveBeenCalledTimes(calls)
    expect(wrapper?.hidden).toBe(false)
    expect(wrapper?.style.display).toBe("")
    expect(wrapper?.hasAttribute("inert")).toBe(false)
    expect(element.querySelector("app-audit-viewer")?.textContent).not.toContain("Cargando")
  })

  it("keeps RBAC gated until catalog retry succeeds", async () => {
    vi.spyOn(TestBed.inject(UserStore), "loadUsers").mockReturnValueOnce(
      of(Result.failure(new UserError("UNEXPECTED")))
    )
    const query = vi.spyOn(TestBed.inject(RbacRepositoryImpl), "getRolePermissions")
    const fixture = TestBed.createComponent(UsersPage)
    fixture.detectChanges()
    await visit(fixture, "rbac")
    expect(query).not.toHaveBeenCalled()
    await flush(fixture.whenStable())
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain("No pudimos cargar el catálogo")
    expect(query).not.toHaveBeenCalled()
    fixture.nativeElement.querySelector("[data-retry]").click()
    fixture.detectChanges()
    expect(query).not.toHaveBeenCalled()
    await flush(fixture.whenStable())
    fixture.detectChanges()
    await vi.advanceTimersByTimeAsync(0)
    fixture.detectChanges()
    expect(query).toHaveBeenCalledOnce()
  })

  it.each(["rbac", "audit"] as const)(
    "lets hidden %s requests finish, preserves errors/retry and cancels on page destruction",
    async section => {
      const { fixture, element } = await setup()
      const rbacPending = new Subject<Result<never, RbacError>>()
      const auditPending = new Subject<Result<never, AuditLogError>>()
      const pending = section === "rbac" ? rbacPending : auditPending
      const repository =
        section === "rbac"
          ? TestBed.inject(RbacRepositoryImpl)
          : TestBed.inject(AuditLogRepositoryImpl)
      const query =
        section === "rbac"
          ? vi.spyOn(repository as RbacRepositoryImpl, "getRolePermissions")
          : vi.spyOn(repository as AuditLogRepositoryImpl, "getAuditLogs")
      if (section === "rbac")
        vi.mocked(TestBed.inject(RbacRepositoryImpl).getRolePermissions).mockReturnValueOnce(
          rbacPending
        )
      else
        vi.mocked(TestBed.inject(AuditLogRepositoryImpl).getAuditLogs).mockReturnValueOnce(
          auditPending
        )
      await visit(fixture, section)
      expect(pending.observed).toBe(true)
      await visit(fixture, "users")
      expect(pending.observed).toBe(true)
      // A hidden initial request can complete with an error; revisit must not silently retry it.
      if (section === "rbac") rbacPending.next(Result.failure(new RbacError("UNEXPECTED")))
      else auditPending.next(Result.failure(new AuditLogError("UNEXPECTED")))
      pending.complete()
      // RBAC also awaits its independent real permission-catalog query.
      await vi.advanceTimersByTimeAsync(250)
      await visit(fixture, section)
      expect(query).toHaveBeenCalledOnce()
      expect(
        element.querySelector(
          `app-${section === "rbac" ? "rbac-matrix" : "audit-viewer"} [role="alert"]`
        )
      ).not.toBeNull()
      const component =
        section === "rbac"
          ? (fixture.debugElement.query(By.directive(RbacMatrix)).componentInstance as RbacMatrix)
          : (fixture.debugElement.query(By.directive(AuditViewer)).componentInstance as AuditViewer)
      component.retry()
      await visit(fixture, "users")
      await vi.advanceTimersByTimeAsync(500)
      await visit(fixture, section)
      expect(
        element.querySelector(
          `app-${section === "rbac" ? "rbac-matrix" : "audit-viewer"} [role="alert"]`
        )
      ).toBeNull()
      expect(query).toHaveBeenCalledTimes(2)
      const cancelled = new Subject<never>()
      query.mockReturnValueOnce(cancelled)
      component.retry()
      await visit(fixture, "users")
      expect(cancelled.observed).toBe(true)
      fixture.destroy()
      expect(cancelled.observed).toBe(false)
    }
  )

  it("opts Users controls into the shared catalog filter contract without local dimensions", async () => {
    const { element } = await setup()
    const row = element.querySelector(".catalog-filter-row")!
    expect(row).not.toBeNull()
    expect(
      row.querySelector(".catalog-filter-search > [data-slot='input-group'] #user-search")
    ).not.toBeNull()
    expect(row.querySelectorAll("[data-slot='native-select']")).toHaveLength(2)
    expect(row.querySelector("[data-slot='button']#new-user")).not.toBeNull()
    expect(row.querySelector(".h-9, .sm\\:w-60, .xl\\:w-100")).toBeNull()
  })

  it("collects global sessions, groups loaded users and filters locally without altering global metrics", async () => {
    const { element, fixture, page } = await setup()
    const query = vi.spyOn(TestBed.inject(USER_SESSION_REPOSITORY), "getUserSessions")
    const tab = element.querySelector<HTMLButtonElement>("[data-sessions-tab]")!
    expect(tab.disabled).toBe(false)
    expect(page.sessions.sessions()).toHaveLength(26)
    expect(page.sessions.loaded()).toBe(true)
    expect(page.sessionCount()).toBe(26)
    tab.click()
    fixture.detectChanges()
    expect(element.querySelectorAll("details[data-session-user]")).toHaveLength(5)
    element
      .querySelector<HTMLButtonElement>('app-user-sessions button[aria-label="Página siguiente"]')!
      .click()
    fixture.detectChanges()
    expect(element.textContent).toContain("Mostrando 6–10 de 49 usuarios")
    const input = element.querySelector<HTMLInputElement>("#session-search")!
    input.value = "server@example.test"
    input.dispatchEvent(new Event("input"))
    fixture.detectChanges()
    expect(element.querySelectorAll("details[data-session-user]")).toHaveLength(1)
    expect(element.textContent).toContain("Usuario de sesión")
    expect(element.textContent).toContain("Tu sesión actual")
    expect(element.textContent).toContain("Para cerrarla usa Salir")
    expect(element.textContent).toContain("Mostrando 1–1 de 1 usuarios")
    expect(element.querySelector("#session-user-id")).toBeNull()
    expect(query).not.toHaveBeenCalled()
    expect(page.sessionCount()).toBe(26)
    expect(element.querySelector("[data-session-metric]")?.textContent?.trim()).toBe("26")
    expect(page.users.users().every(user => user.id !== 90)).toBe(true)
    element.querySelector<HTMLButtonElement>("[data-users-tab]")!.click()
    fixture.detectChanges()
    expect(page.filteredUsers()).toHaveLength(48)
    expect(page.users.users()).toHaveLength(48)
  })

  it("requeries once after revoke and derives counts from records, not expiry", async () => {
    const { page, fixture, element } = await setup()
    const query = vi.spyOn(TestBed.inject(USER_SESSION_REPOSITORY), "getUserSessions")
    expect(page.sessionCount()).toBe(26)
    await flush(firstValueFrom(page.sessions.revokeSession(90, 2)))
    fixture.detectChanges()
    expect(query).toHaveBeenCalledExactlyOnceWith()
    expect(element.querySelector("[data-session-metric]")?.textContent?.trim()).toBe("26")
    expect(element.querySelector("[data-sessions-tab]")?.textContent).toContain("26")
    vi.setSystemTime(
      Math.max(...page.sessions.sessions().map(session => session.expiryDate.getTime()))
    )
    await vi.advanceTimersByTimeAsync(1000)
    fixture.detectChanges()
    expect(page.sessions.activeSessions()).toHaveLength(0)
    expect(page.sessionCount()).toBe(26)
    const clock = vi.spyOn(page.sessions, "refreshClock")
    fixture.destroy()
    await vi.advanceTimersByTimeAsync(1000)
    expect(clock).not.toHaveBeenCalled()
  })

  it("enables RBAC and preserves Users filters after returning", async () => {
    const { element, fixture, page } = await setup()
    page.setSearch("Laura")
    // Stabilize the view before mounting the independently loading matrix.
    await flush(fixture.whenStable())
    fixture.detectChanges()
    const tab = element.querySelector<HTMLButtonElement>("[data-rbac-tab]")!
    expect(tab).not.toBeNull()
    expect(tab.disabled).toBe(false)
    tab.click()
    fixture.detectChanges()
    await vi.advanceTimersByTimeAsync(500)
    fixture.detectChanges()
    expect(element.querySelector("app-rbac-matrix")).not.toBeNull()
    expect(element.querySelectorAll('fieldset[data-module="Backend"]')).toHaveLength(1)
    expect(element.querySelector("app-user-sessions")).toBeNull()
    element.querySelector<HTMLButtonElement>("[data-users-tab]")!.click()
    fixture.detectChanges()
    expect(page.search()).toBe("Laura")
    expect(element.querySelector("#user-search")).not.toBeNull()
  })

  it("starts concurrent catalog queries and cancels both on destruction without mutations", async () => {
    const roles = TestBed.inject(RolesStore),
      users = TestBed.inject(UserStore)
    const loadUsers = vi.spyOn(users, "loadUsers")
    const createRole = vi.spyOn(roles, "createRole")
    const fixture = TestBed.createComponent(UsersPage)
    fixture.detectChanges()
    const page = fixture.componentInstance
    expect(roles.loading()).toBe(true)
    expect(users.loading()).toBe(true)
    expect(page.sessions.loading()).toBe(true)
    expect(loadUsers).toHaveBeenCalledOnce()
    fixture.destroy()
    await vi.advanceTimersByTimeAsync(250)
    expect(roles.loading()).toBe(false)
    expect(users.loading()).toBe(false)
    expect(createRole).not.toHaveBeenCalled()
    expect(roles.roles()).toEqual([])
    expect(users.users()).toEqual([])
    expect(page.sessions.sessions()).toEqual([])
    expect(page.sessions.loading()).toBe(false)
    expect(page.loadError()).toBe(false)
  })

  it("does not set page feedback after a cancelled query", async () => {
    const response = new Subject<ReturnType<typeof Result.failure<UserError>>>()
    vi.spyOn(TestBed.inject(UserStore), "loadUsers").mockReturnValue(response)
    const fixture = TestBed.createComponent(UsersPage)
    fixture.detectChanges()
    const page = fixture.componentInstance
    const setError = vi.spyOn(page.loadError, "set")
    fixture.destroy()
    expect(response.observed).toBe(false)
    response.next(Result.failure(new UserError("UNEXPECTED")))
    response.complete()
    await Promise.resolve()
    expect(setError).not.toHaveBeenCalled()
  })

  it("renders an empty catalog without creating records at page entry", async () => {
    vi.spyOn(TestBed.inject(UserInMemorySource), "getUsers").mockReturnValue(of(Result.success([])))
    const create = vi.spyOn(TestBed.inject(UserStore), "createUser")
    const { element, page } = await setup()
    expect(element.textContent).toContain("Aún no hay usuarios")
    expect(page.loadError()).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it("keeps icon-only actions named per record on desktop and mobile without role management", async () => {
    const { page, element } = await setup()
    expect(element.textContent).not.toContain("Gestionar roles")
    for (const surface of [
      element.querySelector("tbody")!,
      element.querySelector('ul[aria-label="Usuarios"]')!
    ]) {
      for (const user of page.visibleUsers()) {
        for (const action of [
          "Editar usuario",
          "Eliminar usuario",
          user.isActive ? "Desactivar usuario" : "Activar usuario"
        ]) {
          const button = surface.querySelector<HTMLButtonElement>(
            `button[aria-label="${action} ${user.name}"]`
          )!
          expect(button).not.toBeNull()
          expect(button.textContent?.trim()).toBe("")
          expect(button.querySelector("ng-icon")?.getAttribute("aria-hidden")).toBe("true")
          expect(button.disabled).toBe(false)
        }
      }
    }
  })

  it("retains seven scoped table columns, mobile records and labelled filter controls", async () => {
    const { element, page } = await setup()
    const headings = Array.from(element.querySelectorAll("thead th"))
    expect(headings).toHaveLength(7)
    expect(headings.every(heading => heading.getAttribute("scope") === "col")).toBe(true)
    expect(element.querySelectorAll("tbody tr")).toHaveLength(page.visibleUsers().length)
    expect(element.querySelectorAll('ul[aria-label="Usuarios"] > li')).toHaveLength(
      page.visibleUsers().length
    )
    for (const id of ["user-search", "role-filter", "status-filter"]) {
      expect(element.querySelector(`label[for="${id}"]`)?.textContent?.trim()).toBeTruthy()
      expect(element.querySelector(`#${id}`)).not.toBeNull()
    }
    expect(element.querySelector("main h1#users-title")).not.toBeNull()
  })

  it("ignores dialog callbacks after the owning page is destroyed", async () => {
    const { page, fixture } = await setup()
    const success = vi.spyOn(TestBed.inject(HotToastService), "success")
    const open = vi
      .spyOn(TestBed.inject(HlmDialogService), "open")
      .mockReturnValue(undefined as never)
    page.editUser()
    const saved = open.mock.calls.at(-1)![1]!.context as { onSaved: () => void }
    page.deleteUser(page.visibleUsers()[0])
    const deleted = open.mock.calls.at(-1)![1]!.context as { onDeleted: () => void }
    page.changeUserStatus(page.visibleUsers()[0])
    const changed = open.mock.calls.at(-1)![1]!.context as UserStatusContext
    fixture.destroy()
    changed.onChanged()
    saved.onSaved()
    expect(success).not.toHaveBeenCalled()
    deleted.onDeleted()
    expect(success).not.toHaveBeenCalled()
  })

  it("wires both status directions on desktop/mobile to confirmation without mutation or early toast", async () => {
    const { page, users, element } = await setup()
    const update = vi.spyOn(users, "updateUserById")
    const success = vi.spyOn(TestBed.inject(HotToastService), "success")
    const open = vi
      .spyOn(TestBed.inject(HlmDialogService), "open")
      .mockReturnValue(undefined as never)
    for (const surface of [
      element.querySelector("tbody")!,
      element.querySelector('ul[aria-label="Usuarios"]')!
    ]) {
      for (const user of [page.visibleUsers()[0], page.visibleUsers()[4]]) {
        const verb = user.isActive ? "Desactivar" : "Activar"
        const button = surface.querySelector<HTMLButtonElement>(
          `button[aria-label="${verb} usuario ${user.name}"]`
        )!
        expect(button.querySelector('ng-icon[name="lucidePower"]')).not.toBeNull()
        button.click()
        expect(open.mock.calls.at(-1)![0]).toBe(UserStatusDialog)
        const options = open.mock.calls.at(-1)![1]!
        expect(options.disableClose).toBe(true)
        expect(options.showCloseButton).toBe(false)
        const context = options.context as UserStatusContext
        expect(context.user).toBe(user)
        expect(update).not.toHaveBeenCalled()
        expect(success).not.toHaveBeenCalled()
      }
    }
    const context = open.mock.calls.at(-1)![1]!.context as UserStatusContext
    page.setSearch("persona")
    page.setRoleFilter("3")
    page.setStatusFilter("inactive")
    const filters = [page.search(), page.roleFilter(), page.statusFilter(), page.currentPage()]
    context.onChanged()
    expect(success).toHaveBeenCalledExactlyOnceWith(`Usuario ${context.user.name} activado`)
    expect([page.search(), page.roleFilter(), page.statusFilter(), page.currentPage()]).toEqual(
      filters
    )
    page.changeUserStatus(users.users()[0])
    ;(open.mock.calls.at(-1)![1]!.context as UserStatusContext).onChanged()
    expect(success).toHaveBeenLastCalledWith(`Usuario ${users.users()[0].name} desactivado`)
  })

  it("renders catalog copy and counts without duplicating shell identity or navigation", async () => {
    const { element } = await setup()
    expect(element.textContent).not.toContain("Actual identity")
    expect(element.querySelector("header")).toBeNull()
    expect(element.querySelector("app-admin-sidebar")).toBeNull()
    expect(element.textContent).toContain("48")
    expect(element.textContent).toContain("42 activos · 6 inactivos")
    expect(element.querySelector(".users-catalog")?.textContent).not.toContain(
      "informados por el servidor"
    )
    expect(element.textContent).not.toContain("CORE BACKOFFICE")
    expect(element.textContent).toContain("Gestiona estados, roles")
    expect(element.textContent).toContain("Total global del servidor")
    expect(element.textContent).toContain("3 Móviles")
    expect(element.querySelector("[data-sessions-tab]")?.textContent).toContain("en línea")
    expect(element.textContent).not.toMatch(/demostración|simulad/i)
    const catalog = element.querySelector(".users-catalog")!
    const accessibleCopy = Array.from(
      catalog.querySelectorAll("[aria-label], [title], caption, [id$='-help']")
    )
      .map(
        node =>
          `${node.textContent} ${node.getAttribute("aria-label") ?? ""} ${node.getAttribute("title") ?? ""}`
      )
      .join(" ")
    expect(`${catalog.textContent} ${accessibleCopy}`).not.toMatch(
      /demo|demostración|en memoria|fictici|sin backend|no implementad|RF02|HU02|P03|M02/i
    )
    expect(element.querySelector("#credentials-help")).toBeNull()
    const credentials = element.querySelectorAll<HTMLButtonElement>(
      'button[aria-describedby="credentials-help"]'
    )
    expect(credentials).toHaveLength(0)
    expect(element.querySelector('ng-icon[name="lucideKeyRound"]')).toBeNull()
    expect(element.textContent).not.toContain("Super Administrador")
    const tabs = element.querySelectorAll<HTMLButtonElement>("[data-future-tab]")
    expect(tabs).toHaveLength(0)
    expect(element.querySelector<HTMLButtonElement>("[data-audit-tab]")?.disabled).toBe(false)
    expect(element.querySelector("#future-tabs-help")).toBeNull()
    expect(element.textContent).toContain("Nunca accedió")
  })

  it("uses product-facing success toasts only after successful user operation callbacks", async () => {
    const { page, fixture, element } = await setup()
    const success = vi.spyOn(TestBed.inject(HotToastService), "success")
    const open = vi
      .spyOn(TestBed.inject(HlmDialogService), "open")
      .mockReturnValue(undefined as never)
    page.editUser()
    const saved = open.mock.calls.at(-1)![1]!.context as { onSaved: () => void }
    expect(success).not.toHaveBeenCalled()
    saved.onSaved()
    fixture.detectChanges()
    expect(success).toHaveBeenCalledExactlyOnceWith("Usuario guardado")
    page.deleteUser(page.visibleUsers()[0])
    const deleted = open.mock.calls.at(-1)![1]!.context as { onDeleted: () => void }
    expect(success).toHaveBeenCalledTimes(1)
    deleted.onDeleted()
    fixture.detectChanges()
    expect(success).toHaveBeenCalledTimes(2)
    expect(success).toHaveBeenLastCalledWith("Usuario Carlos Mendoza eliminado")
    expect(element.querySelector(".users-catalog")?.textContent).not.toMatch(
      /demo|demostración|en memoria|fictici/i
    )
  })

  it("pairs decorative reference tones with actual roles and explicit status labels on desktop and mobile", async () => {
    const { element } = await setup()
    const rows = Array.from(element.querySelectorAll("tbody tr")).slice(0, 5)
    expect(
      rows.map(row => row.querySelector("[data-avatar-tone]")?.getAttribute("data-avatar-tone"))
    ).toEqual(["navy", "coral", "green", "amber", "neutral"])
    expect(
      rows.map(row => row.querySelector("[data-role-tone]")?.getAttribute("data-role-tone"))
    ).toEqual(["purple", "blue", "green", "amber", "green"])
    for (const surface of [
      element.querySelector("tbody")!,
      element.querySelector('ul[aria-label="Usuarios"]')!
    ]) {
      expect(surface.querySelectorAll('[data-status="active"]')).toHaveLength(9)
      expect(surface.querySelector('[data-status="active"]')?.textContent).toContain("Activo")
      expect(surface.querySelector('[data-status="inactive"]')?.textContent).toContain("Inactivo")
      expect(surface.querySelectorAll("[data-role-tone]")).toHaveLength(10)
    }
    expect(element.querySelectorAll(".kpi-tile")).toHaveLength(4)
    expect(element.querySelector("#new-user ng-icon")?.classList.contains("primary-plus")).toBe(
      true
    )
  })

  it("keeps fallback tones deterministic and independent of record IDs and catalog ordering", async () => {
    const { page, roles } = await setup()
    const presentation = page
    const sample = {
      ...page.visibleUsers()[0],
      name: "Nueva Persona",
      email: "new@example.test",
      id: 900
    }
    const avatar = presentation.avatarTone(sample)
    expect(["navy", "coral", "green", "amber", "neutral"]).toContain(avatar)
    expect(presentation.avatarTone({ ...sample, id: 901 })).toBe(avatar)
    const result = await flush(
      firstValueFrom(roles.createRole({ name: "Rol dinámico", description: "", isActive: true }))
    )
    expect(result.success).toBe(true)
    const role = roles.roles().find(item => item.name === "Rol dinámico")!
    const assigned = { ...sample, roleId: role.id }
    const tone = presentation.roleTone(assigned)
    expect(["purple", "blue", "green", "amber"]).toContain(tone)
    const other = await flush(
      firstValueFrom(roles.createRole({ name: role.name, description: "Otro", isActive: true }))
    )
    expect(other.success).toBe(true)
    expect(presentation.roleTone({ ...assigned, roleId: roles.roles().at(-1)!.id })).toBe(tone)
    expect(presentation.roleTone({ ...assigned, roleId: -1 })).toBe("neutral")
  })

  // Inspect authored tokens: jsdom does not measure rendered OKLCH contrast or hover.
  it.each([":root", ":root.dark"])(
    "defines global navy primary with readable foreground and gold accent in %s",
    selector => {
      const globalCss = readFileSync("src/styles.css", "utf8")
      const block = globalCss.split(`${selector} {`)[1]?.split("}")[0] ?? ""
      expect(block).toMatch(/--primary:\s*var\(--navy\);/)
      expect(block).toMatch(/--primary-foreground:\s*var\(--paper\);/)
      expect(block).toMatch(/--accent:\s*var\(--gold\);/)
      expect(block).toMatch(/--accent-foreground:\s*var\(--navy-deep\);/)
    }
  )

  it("centralizes enabled default action hover without changing outline or destructive variants", () => {
    const globalCss = readFileSync("src/styles.css", "utf8")
    expect(globalCss).toMatch(
      /@layer utilities\s*\{\s*\[data-slot="button"\]\.bg-primary:hover:not\(\[data-disabled\]\)\s*\{\s*background-color:\s*var\(--navy-deep\);/
    )
    expect(globalCss).not.toMatch(
      /\[data-slot="button"\][^{]*\.(?:bg-destructive|bg-background)[^{]*\{/
    )
  })

  it("inherits global primary without feature CTA overrides and keeps coral tabs independent", async () => {
    const { element } = await setup()
    const hostScope = element.getAttributeNames().find(name => name.startsWith("_nghost-"))!
    const css = Array.from(document.querySelectorAll("style"))
      .map(style => style.textContent ?? "")
      .find(text => text.includes(`[${hostScope}]`))!
    expect(css).not.toMatch(/--primary(?:-foreground)?:/)
    expect(css).not.toMatch(/\[hlmBtn\].*\.bg-primary.*:hover/)
    expect(css).toMatch(/--users-tab-accent:\s*var\(--coral\)/)
    expect(css).toContain("3px solid var(--users-tab-accent)")
    expect(css).toContain("--users-pink-soft")
    expect(element.querySelector("#new-user")?.classList.contains("bg-primary")).toBe(true)
    expect(element.querySelector("#new-user")?.classList.contains("text-primary-foreground")).toBe(
      true
    )
    expect(element.querySelector("#new-user")?.classList.contains("focus-visible:ring-3")).toBe(
      true
    )
  })

  it.each([12, 101])(
    "accepts capped HTTP catalogs with total %s while local controls make no HTTP requests",
    async total => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: API_URL, useValue: "http://localhost:8080" }
        ]
      })
      TestBed.overrideProvider(USER_REPOSITORY, {
        useFactory: () => TestBed.inject(UserRepositoryImpl)
      })
      const http = TestBed.inject(HttpTestingController)
      const fixture = TestBed.createComponent(UsersPage)
      fixture.detectChanges()
      const request = http.expectOne(req => req.url === "http://localhost:8080/api/usuarios")
      expect(request.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
      expect(request.request.params.get("tamanio")).toBe("500")
      request.flush({
        contenido: Array.from({ length: 12 }, (_, index) => ({
          idUsuario: index + 1,
          nombre: `Server user ${index + 1}`,
          correo: `server${index + 1}@example.test`,
          idRol: (index % 2) + 1,
          idioma: "es",
          activo: index % 2 === 0,
          ultimoAcceso: null,
          fechaCreacion: "2026-01-01T00:00:00Z",
          fechaActualizacion: "2026-01-01T00:00:00Z"
        })),
        pagina: 0,
        tamanio: 100,
        totalElementos: total,
        totalPaginas: Math.ceil(total / 100)
      })
      await flush(fixture.whenStable())
      fixture.detectChanges()
      const page = fixture.componentInstance
      const element = fixture.nativeElement as HTMLElement
      expect(page.loadError()).toBe(false)
      expect(page.users.users()).toHaveLength(12)
      expect(page.visibleUsers()).toHaveLength(10)
      expect(element.querySelectorAll("tbody tr")).toHaveLength(10)
      expect(element.querySelector("[data-incomplete-catalog]")).toBeNull()
      expect(element.querySelector(".users-catalog")?.textContent).not.toMatch(
        /Catálogo incompleto|informados por el servidor|backend/
      )
      page.goToPage(3)
      expect(page.visibleUsers()).toHaveLength(2)
      expect(page.rangeStart()).toBe(11)
      expect(page.rangeEnd()).toBe(12)
      page.setSearch("SERVER12@")
      expect(page.filteredUsers().map(user => user.id)).toEqual([12])
      page.clearFilters()
      page.setRoleFilter("2")
      page.setStatusFilter("inactive")
      expect(page.filteredUsers()).toHaveLength(6)
      expect(page.currentPage()).toBe(1)
      page.goToPage(2)
      expect(page.visibleUsers()).toHaveLength(6)
      http.expectNone(() => true)
      http.verify()
      fixture.destroy()
    }
  )

  it("loads an argument-free array once and filters/pages of ten without further requests", async () => {
    const query = vi.spyOn(TestBed.inject(UserInMemorySource), "getUsers")
    const { page, roles, fixture } = await setup()
    expect(query).toHaveBeenCalledExactlyOnceWith()
    expect(page.pageSize).toBe(10)
    expect(page.visibleUsers()).toHaveLength(10)
    page.goToPage(4)
    expect(page.rangeStart()).toBe(31)
    page.setSearch(" CARLOS ")
    expect(page.currentPage()).toBe(1)
    expect(page.filteredUsers().map(user => user.name)).toEqual(["Carlos Mendoza"])
    page.setSearch("persona.48@")
    expect(page.filteredUsers()).toHaveLength(1)
    page.clearFilters()
    page.goToPage(8)
    page.setRoleFilter(String(roles.roles()[2].id))
    expect(page.currentPage()).toBe(1)
    expect(page.filteredUsers().every(user => user.roleId === roles.roles()[2].id)).toBe(true)
    page.goToPage(2)
    page.setStatusFilter("inactive")
    expect(page.currentPage()).toBe(1)
    expect(page.filteredUsers().every(user => !user.isActive)).toBe(true)
    page.clearFilters()
    await flush(fixture.whenStable())
    expect(page.filteredUsers()).toHaveLength(48)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it("keeps local empty-result copy independent of removed transport metadata", async () => {
    const { page, fixture, element } = await setup()
    page.retry()
    await flush(fixture.whenStable())
    page.setSearch("no-such-user")
    fixture.detectChanges()
    expect(element.querySelector("[data-incomplete-catalog]")).toBeNull()
    expect(element.textContent).toContain("Sin resultados")
    expect(element.textContent).not.toMatch(
      /Catálogo incompleto|Sin resultados entre los usuarios cargados/
    )
    expect(element.textContent).not.toContain("Aún no hay usuarios")
  })

  it("counts every loaded user independently of local filters and hides the warning for a complete catalog", async () => {
    const { page, fixture, element } = await setup()
    const active = page.users.users().filter(user => user.isActive).length
    expect(page.activeCount()).toBe(active)
    page.setStatusFilter("inactive")
    fixture.detectChanges()
    expect(page.activeCount()).toBe(active)
    expect(element.querySelector("[data-incomplete-catalog]")).toBeNull()
    expect(element.textContent).toContain(`${active} activos`)
    expect(element.textContent).toContain(`${48 - active} inactivos`)
    expect(page.rangeEnd()).toBe(Math.min(10, page.filteredUsers().length))
  })

  it("connects bounded shared navigation to local pages and filter resets", async () => {
    const { page, fixture, element } = await setup()
    const nav = () =>
      element.querySelector('app-table-pagination nav[aria-label="Paginación de usuarios"]')!
    const select = async (number: number) => {
      nav().querySelector<HTMLButtonElement>(`button[aria-label="Página ${number}"]`)!.click()
      await flush(fixture.whenStable())
      fixture.detectChanges()
    }
    expect(nav()).not.toBeNull()
    expect(
      nav().querySelectorAll(
        'button[aria-label^="Página "]:not([aria-label="Página anterior"]):not([aria-label="Página siguiente"])'
      )
    ).toHaveLength(5)
    await select(5)
    expect(page.currentPage()).toBe(5)
    expect(page.visibleUsers()).toHaveLength(8)
    expect(nav().querySelector('button[aria-current="page"]')?.textContent?.trim()).toBe("5")
    nav().querySelector<HTMLButtonElement>('button[aria-label="Página anterior"]')!.click()
    await flush(fixture.whenStable())
    fixture.detectChanges()
    expect(page.currentPage()).toBe(4)
    expect(page.visibleUsers()).toHaveLength(10)
    nav().querySelector<HTMLButtonElement>('button[aria-label="Página siguiente"]')!.click()
    await flush(fixture.whenStable())
    fixture.detectChanges()
    expect(page.currentPage()).toBe(5)
    page.setSearch("persona.48@")
    await flush(fixture.whenStable())
    fixture.detectChanges()
    expect(page.currentPage()).toBe(1)
    expect(
      nav().querySelectorAll(
        'button[aria-label^="Página "]:not([aria-label="Página anterior"]):not([aria-label="Página siguiente"])'
      )
    ).toHaveLength(1)
    expect(
      nav().querySelector<HTMLButtonElement>('button[aria-label="Página siguiente"]')?.disabled
    ).toBe(true)
  })

  it("clamps the current page when last-page users are deleted", async () => {
    const { page, users, fixture, element } = await setup()
    page.goToPage(5)
    await flush(fixture.whenStable())
    expect(page.visibleUsers()).toHaveLength(8)
    for (const user of [...page.visibleUsers()])
      await flush(firstValueFrom(users.deleteUserById(user.id)))
    expect(page.currentPage()).toBe(4)
    expect(page.visibleUsers()).toHaveLength(10)
    // Later growth must not resurrect the previously invalid page 5.
    await flush(
      firstValueFrom(
        users.createUser({
          name: "New user",
          email: "new@example.test",
          password: "Password1",
          lang: page.users.users()[0].lang,
          roleId: 1,
          isActive: true
        })
      )
    )
    expect(page.currentPage()).toBe(4)
    fixture.detectChanges()
    const nav = element.querySelector('nav[aria-label="Paginación de usuarios"]')!
    expect(nav.querySelector('button[aria-current="page"]')?.textContent?.trim()).toBe("4")
    expect(
      nav.querySelector<HTMLButtonElement>('button[aria-label="Página siguiente"]')?.disabled
    ).toBe(false)
  })

  it("shows empty filtered results and offers a reset action", async () => {
    const { page, fixture, element } = await setup()
    page.setSearch("no-such-user")
    await flush(fixture.whenStable())
    fixture.detectChanges()
    expect(element.textContent).toContain("Sin resultados")
    const reset = element.querySelector<HTMLButtonElement>("[data-reset-filters]")!
    reset.click()
    await flush(fixture.whenStable())
    fixture.detectChanges()
    expect(page.filteredUsers()).toHaveLength(48)
    expect(page.users.users()).toHaveLength(48)
  })

  it("displays query failure with retry and a loading state", async () => {
    const users = TestBed.inject(UserStore)
    const load = vi.spyOn(users, "loadUsers")
    load.mockReturnValueOnce(of(Result.failure(new UserError("UNEXPECTED"))))
    const fixture = TestBed.createComponent(UsersPage)
    fixture.detectChanges()
    await flush(fixture.whenStable())
    fixture.detectChanges()
    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain("No pudimos cargar")
    const retry = element.querySelector<HTMLButtonElement>("[data-retry]")!
    retry.click()
    fixture.detectChanges()
    expect(element.textContent).toContain("Cargando catálogo")
    await flush(fixture.whenStable())
    fixture.detectChanges()
    expect(element.textContent).toContain("Carlos Mendoza")
    expect(load).toHaveBeenCalledTimes(2)
  })
})
