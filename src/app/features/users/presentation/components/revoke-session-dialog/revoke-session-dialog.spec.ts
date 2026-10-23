import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { Component, getDebugNode, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EMPTY, firstValueFrom, of, Subject, throwError, timer, map } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserSessionError } from "../../../domain/errors/user-session.error"
import { USER_SESSION_REPOSITORY } from "../../../domain/repositories/user-session.repository"
import { UserSession } from "../../../domain/entities/user-session.entity"
import { UserSessionsStore } from "../../state/user-sessions.store"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { RevokeSessionContext, RevokeSessionDialog } from "./revoke-session-dialog"

@Component({ template: "" })
class TestHost {}
async function flush<T>(promise: Promise<T>) {
  await vi.runAllTimersAsync()
  return promise
}

describe("RevokeSessionDialog", () => {
  let records: UserSession[]
  beforeEach(() => {
    records = [true, false].map((current, index) =>
      UserSession.create(
        90 + index,
        42,
        "192.0.2.1",
        "Navegador real",
        new Date(Date.now() - 1000),
        new Date(Date.now() + 60000),
        current,
        "Persona real",
        "real@example.test"
      )
    )
    vi.useFakeTimers()
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [
        {
          provide: AuthStore,
          useValue: {
            session: signal(AuthSession.create("Test", "test@example.test", null, null, 1))
          }
        },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } },
        {
          provide: USER_SESSION_REPOSITORY,
          useValue: {
            getUserSessionsByUser: () => of(Result.success(records)),
            revokeUserSession: (_userId: number, id: number) =>
              timer(250).pipe(
                map(() => {
                  records = records.filter(s => s.id !== id)
                  return Result.success(undefined)
                })
              ),
            revokeUserSessions: () => of(Result.success(undefined))
          }
        }
      ]
    })
  })
  afterEach(() => vi.useRealTimers())
  async function setup(current = false) {
    const sessions = TestBed.inject(UserSessionsStore)
    await flush(firstValueFrom(sessions.loadDetails(42)))
    const user = { id: 42, name: "Persona real", email: "real@example.test" },
      session = sessions
        .details()[42]
        .items.find(item => item.userId === user.id && item.isCurrent === current)!
    const fixture = TestBed.createComponent(TestHost)
    fixture.detectChanges()
    const changed = vi.fn()
    const ref = TestBed.inject(HlmDialogService).open<void, RevokeSessionContext>(
      RevokeSessionDialog,
      {
        context: { user, session, onRevoked: changed },
        disableClose: true,
        showCloseButton: false
      }
    )
    await flush(fixture.whenStable())
    const element = document.querySelector<HTMLElement>("app-revoke-session-dialog")!
    const injector = getDebugNode(element)!.injector
    return {
      sessions,
      user,
      session,
      changed,
      ref,
      element,
      dialog: injector.get(RevokeSessionDialog),
      cdk: injector.get(CdkDialogRef)
    }
  }
  it("confirms affected name/device, has shared accessible title and updates only after success", async () => {
    const { element, dialog, sessions, session, user, changed, ref } = await setup()
    expect(element.firstElementChild?.getAttribute("data-slot")).toBe("dialog-header")
    expect(element.querySelector('[data-slot="dialog-title"]')?.textContent).toBe("Cerrar sesión")
    expect(element.textContent).toContain(user.name)
    expect(element.textContent).toContain(session.device)
    expect(element.textContent).not.toContain(user.email)
    const pending = dialog.confirm()
    expect(changed).not.toHaveBeenCalled()
    expect(sessions.details()[42].items.some(item => item.id === session.id)).toBe(true)
    await flush(pending)
    expect(changed).toHaveBeenCalledOnce()
    expect(sessions.details()[42].loaded).toBe(false)
    expect(sessions.mutationRevision()).toBe(1)
    await flush(firstValueFrom(sessions.loadDetails(42)))
    expect(sessions.details()[42].items.some(item => item.id === session.id)).toBe(false)
    expect(ref.state()).toBe("closed")
  })
  it.each(["cancel", "backdrop", "outside", "escape"])("allows idle %s dismissal", async action => {
    const { dialog, cdk, element, ref, sessions } = await setup()
    const revoke = vi.spyOn(sessions, "revokeSession")
    if (action === "cancel") dialog.cancel()
    else if (action === "backdrop") cdk.overlayRef.backdropElement!.click()
    else if (action === "outside") document.body.click()
    else
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
      )
    await vi.runAllTimersAsync()
    expect(ref.state()).toBe("closed")
    expect(revoke).not.toHaveBeenCalled()
  })
  it("guards all pending dismissals and duplicate confirms then unlocks retry on failure", async () => {
    const { dialog, sessions, cdk, element, ref, changed } = await setup()
    const response = new Subject<Result<void, UserSessionError>>()
    const revoke = vi.spyOn(sessions, "revokeSession").mockReturnValueOnce(response)
    const pending = dialog.confirm()
    await dialog.confirm()
    dialog.cancel()
    TestBed.tick()
    expect(element.querySelectorAll("button:disabled")).toHaveLength(2)
    expect(element.querySelector("hlm-spinner")).not.toBeNull()
    cdk.overlayRef.backdropElement!.click()
    document.body.click()
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
    )
    expect(ref.state()).toBe("open")
    expect(revoke).toHaveBeenCalledOnce()
    response.next(Result.failure(new UserSessionError("UNEXPECTED")))
    response.complete()
    await pending
    TestBed.tick()
    expect(element.querySelector('[role="alert"]')?.textContent).toContain("No pudimos cerrar")
    expect(changed).not.toHaveBeenCalled()
    await flush(dialog.confirm())
    expect(changed).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledTimes(2)
  })
  it.each(["SESSION_NOT_FOUND", "CURRENT_SESSION"] as const)(
    "shows %s typed failure without success",
    async code => {
      const { dialog, sessions, changed, ref } = await setup()
      vi.spyOn(sessions, "revokeSession").mockReturnValue(
        of(Result.failure(new UserSessionError(code)))
      )
      await dialog.confirm()
      expect(dialog.error()).toContain(
        code === "CURRENT_SESSION" ? "usa Salir" : "ya no está activa"
      )
      expect(ref.state()).toBe("open")
      expect(changed).not.toHaveBeenCalled()
    }
  )
  it("never submits the current session even when directly invoked", async () => {
    const { dialog, sessions, changed } = await setup(true)
    const revoke = vi.spyOn(sessions, "revokeSession")
    await dialog.confirm()
    expect(revoke).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
  })
  it("unlocks on thrown failure without confirming success", async () => {
    const { dialog, sessions, changed } = await setup()
    vi.spyOn(sessions, "revokeSession").mockReturnValue(throwError(() => new Error("failure")))
    await dialog.confirm()
    expect(dialog.error()).toContain("No pudimos cerrar")
    expect(dialog.submitting()).toBe(false)
    expect(changed).not.toHaveBeenCalled()
  })
  it.each(["success", "failure"])(
    "suppresses late %s and unsubscribes after destruction",
    async outcome => {
      const { dialog, sessions, changed, cdk } = await setup()
      const response = new Subject<Result<void, UserSessionError>>()
      vi.spyOn(sessions, "revokeSession").mockReturnValue(response)
      const pending = dialog.confirm(),
        feedback = vi.spyOn(dialog.error, "set")
      cdk.close()
      expect(response.observed).toBe(false)
      response.next(
        outcome === "success"
          ? Result.success(undefined)
          : Result.failure(new UserSessionError("UNEXPECTED"))
      )
      response.complete()
      await pending
      expect(changed).not.toHaveBeenCalled()
      expect(feedback).not.toHaveBeenCalled()
    }
  )
  it("cancels component-owned pending work on destruction", async () => {
    const { dialog, sessions, session, changed, cdk } = await setup()
    const pending = dialog.confirm()
    cdk.close()
    await flush(pending)
    expect(sessions.details()[42].items.some(item => item.id === session.id)).toBe(true)
    expect(changed).not.toHaveBeenCalled()
  })
})
