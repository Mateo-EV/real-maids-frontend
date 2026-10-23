import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { EMPTY, of, Subject, Subscription } from "rxjs"
import { describe, it, expect, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { UserSessionOwnerQuery } from "../../domain/models/user-session-owner-query"
import { UserSessionsStore } from "./user-sessions.store"

// Previous component-store contracts, exercised through the root state and readonly projection.
function setup(getSessionOwners: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthStore,
        useValue: {
          session: signal(AuthSession.create("Test", "test@example.test", null, null, 1))
        }
      },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } },
      { provide: USER_SESSION_REPOSITORY, useValue: { getSessionOwners } }
    ]
  })
  const root = TestBed.inject(UserSessionsStore)
  const query = signal<UserSessionOwnerQuery>({ offset: 0, limit: 5 })
  let subscription: Subscription | undefined
  return {
    store: root.selectOwners(query),
    load: (value: UserSessionOwnerQuery) => {
      subscription?.unsubscribe()
      query.set(value)
      subscription = root.observeOwners(value).subscribe()
      return subscription
    }
  }
}
describe("session owner readonly projection and migrated query contracts", () => {
  it("adopts effective pagination, preserves false filters and clamps only once", () => {
    const getSessionOwners = vi
      .fn()
      .mockReturnValueOnce(of(Result.success({ items: [], total: 3, offset: 4, limit: 2 })))
      .mockReturnValueOnce(
        of(Result.success({ items: [{ id: 3 }], total: 3, offset: 2, limit: 2 }))
      )
    const { store, load } = setup(getSessionOwners)
    const subscription = load({ offset: 10, limit: 5, hasSessions: false })
    expect(getSessionOwners.mock.calls).toEqual([
      [{ offset: 10, limit: 5, hasSessions: false }],
      [{ offset: 2, limit: 2, hasSessions: false }]
    ])
    expect(store.query()).toEqual({ offset: 2, limit: 2, hasSessions: false })
    expect(store.loaded()).toBe(true)
    subscription.unsubscribe()
  })
  it("bounds corrective reads, hides failed results and permits retry with effective query", () => {
    const getSessionOwners = vi
      .fn()
      .mockReturnValue(of(Result.success({ items: [], total: 0, offset: 5, limit: 5 })))
    const { store, load } = setup(getSessionOwners)
    load({ offset: 10, limit: 5, search: "Ana" })
    expect(getSessionOwners).toHaveBeenCalledTimes(2)
    expect(store.error()?.code).toBe("INVALID_RESPONSE")
    expect(store.loaded()).toBe(false)
    expect(store.result()).toBeUndefined()
    getSessionOwners.mockReturnValue(
      of(Result.success({ items: [], total: 0, offset: 0, limit: 5 }))
    )
    const subscription = load(store.query())
    expect(store.loaded()).toBe(true)
    expect(store.query()).toEqual({ offset: 0, limit: 5, search: "Ana" })
    subscription.unsubscribe()
  })
  it("cancels obsolete queries and never trusts cancelled results", () => {
    const old = new Subject(),
      fresh = new Subject()
    const getSessionOwners = vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(fresh)
    const { store, load } = setup(getSessionOwners)
    load({ offset: 0, limit: 5 })
    const subscription = load({ offset: 0, limit: 5, search: "Ana" })
    expect(old.observed).toBe(false)
    subscription.unsubscribe()
    expect(fresh.observed).toBe(false)
    expect(store.loaded()).toBe(false)
    expect(store.loading()).toBe(false)
  })
})
