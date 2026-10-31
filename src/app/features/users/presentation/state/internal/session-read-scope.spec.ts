import { PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { Subject } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { createSessionReadScope } from "./session-read-scope"

function setup(platform = "browser") {
  const session = signal<AuthSession | null>(AuthSession.create("Tester", "tester@example.test"))
  const changes = new Subject<AuthSession | null>()
  const resolveAuth = vi.fn(() => ({ session }))
  const observe = vi.fn(() => changes)
  const reset = vi.fn()
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platform },
      { provide: AuthStore, useFactory: resolveAuth },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: observe } }
    ]
  })
  const scope = TestBed.runInInjectionContext(() => createSessionReadScope(reset))
  return { scope, session, changes, resolveAuth, observe, reset }
}

describe("session read scope", () => {
  it("does not acquire auth or observe on the server", () => {
    const { scope, resolveAuth, observe } = setup("server")
    expect(scope.check()).toBe(false)
    expect(resolveAuth).not.toHaveBeenCalled()
    expect(observe).not.toHaveBeenCalled()
  })

  it("acquires auth lazily and observes once without resetting the initial session", () => {
    const { scope, resolveAuth, observe, reset } = setup()
    expect(resolveAuth).not.toHaveBeenCalled()
    expect(scope.check()).toBe(true)
    expect(scope.check()).toBe(true)
    expect(resolveAuth).toHaveBeenCalledTimes(1)
    expect(observe).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
  })

  it("preserves same-session renewals and cancels and fences replacement and logout", () => {
    const { scope, session, changes, reset } = setup()
    scope.check()
    const generation = scope.generation()
    const cancelled = vi.fn()
    scope.cancelled$.subscribe(cancelled)
    changes.next(AuthSession.create("Renamed", "tester@example.test"))
    expect(scope.generation()).toBe(generation)
    expect(cancelled).not.toHaveBeenCalled()
    const replacement = AuthSession.create("Other", "other@example.test")
    session.set(replacement)
    changes.next(replacement)
    expect(scope.generation()).toBe(generation + 1)
    expect(reset).toHaveBeenCalledTimes(1)
    expect(cancelled).toHaveBeenCalledTimes(1)
    session.set(null)
    changes.next(null)
    expect(scope.check()).toBe(false)
    expect(scope.generation()).toBe(generation + 2)
    expect(reset).toHaveBeenCalledTimes(2)
    expect(cancelled).toHaveBeenCalledTimes(2)
  })

  it("detects expiration on reads without polling", () => {
    const { scope, session, reset } = setup()
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    try {
      session.set(AuthSession.create("Tester", "tester@example.test", null, 2000))
      expect(scope.check()).toBe(true)
      const generation = scope.generation()
      now.mockReturnValue(2000)
      expect(reset).not.toHaveBeenCalled()
      expect(scope.check()).toBe(false)
      expect(scope.generation()).toBe(generation + 1)
      expect(reset).toHaveBeenCalledTimes(1)
    } finally {
      now.mockRestore()
    }
  })

  it("unsubscribes observation, cancels and resets on destruction", () => {
    const { scope, changes, reset } = setup()
    scope.check()
    const cancelled = vi.fn()
    scope.cancelled$.subscribe(cancelled)
    expect(changes.observed).toBe(true)
    TestBed.resetTestingModule()
    expect(changes.observed).toBe(false)
    expect(cancelled).toHaveBeenCalledTimes(1)
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
