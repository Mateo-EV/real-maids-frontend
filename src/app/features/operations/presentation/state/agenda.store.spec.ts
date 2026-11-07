import { createEnvironmentInjector, EnvironmentInjector, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Subscription } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { GetAgendaUseCase } from "../../application/use-cases/get-agenda.use-case"
import { AgendaQuery } from "../../domain/params/operations.params"
import { AgendaStore } from "./agenda.store"
import { agendaEntry, ControlledAgenda } from "./agenda.testing"

const deadline = 4102444800000
const caller = (id = 19, expires = deadline) =>
  AuthSession.create("Caller", `caller${id}@example.test`, null, expires, id)
const query = (): AgendaQuery => ({ from: "2024-02-29", until: "2024-02-29" })

describe("T7C finite page-owned AgendaStore / S1,S2,S3,S4,S8,S9,S10", () => {
  let reads: ControlledAgenda
  let sessions: BehaviorSubject<AuthSession | null>
  let authFactory: ReturnType<typeof vi.fn>
  let readFactory: ReturnType<typeof vi.fn>
  let subscriptions: Subscription[]
  beforeEach(() => {
    reads = new ControlledAgenda()
    sessions = new BehaviorSubject<AuthSession | null>(caller())
    subscriptions = []
    authFactory = vi.fn(() => ({ session: () => sessions.value }))
    readFactory = vi.fn(() => reads)
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: AuthStore, useFactory: authFactory },
        {
          provide: ObserveAuthSessionUseCase,
          useValue: { execute: () => sessions.asObservable() }
        },
        { provide: GetAgendaUseCase, useFactory: readFactory }
      ]
    })
  })
  afterEach(() => {
    subscriptions.forEach(s => s.unsubscribe())
    vi.restoreAllMocks()
  })
  function setup() {
    const owner = createEnvironmentInjector([AgendaStore], TestBed.inject(EnvironmentInjector))
    return { owner, store: owner.get(AgendaStore) }
  }
  function load(store: InstanceType<typeof AgendaStore>, q = query()) {
    const subscription = store.loadAgenda(q).subscribe()
    subscriptions.push(subscription)
    return subscription
  }
  it("has no root instance and creates independent page-owned states without initializing auth or reads", () => {
    expect(TestBed.inject(EnvironmentInjector).get(AgendaStore, null)).toBeNull()
    const a = setup(),
      b = setup()
    expect(a.store).not.toBe(b.store)
    expect(a.store.result()).toBeUndefined()
    expect(a.store.query()).toBeUndefined()
    expect(authFactory).not.toHaveBeenCalled()
    expect(readFactory).not.toHaveBeenCalled()
    a.owner.destroy()
    b.owner.destroy()
  })
  it("captures inputs at call time but dispatches only on caller subscription and completes finitely", () => {
    const { owner, store } = setup()
    const input = { ...query(), staffId: 77 }
    const pending = store.loadAgenda(input)
    input.staffId = 88
    expect(reads.calls).toHaveLength(0)
    const sub = pending.subscribe()
    expect(reads.latest().query).toEqual({ ...query(), staffId: 77 })
    expect(store.loading()).toBe(true)
    const rows = [agendaEntry(22), agendaEntry(17)]
    reads.latest().succeed(rows)
    expect(sub.closed).toBe(true)
    expect(store.result()).toEqual(rows)
    expect(store.loading()).toBe(false)
    owner.destroy()
  })
  it("does not demand returned staff equal the optional backend-own-scope filter", () => {
    const { owner, store } = setup()
    load(store, { ...query(), staffId: 77 })
    reads.latest().succeed([agendaEntry()])
    expect(store.result()?.[0].assignedStaff[0].staffId).toBe(9)
    expect(store.error()).toBeUndefined()
    owner.destroy()
  })
  it("cancels obsolete queries and hides unrelated verified rows, including late completions", () => {
    const { owner, store } = setup()
    load(store)
    reads.latest().succeed([agendaEntry()])
    load(store)
    const old = reads.latest()
    load(store, { from: "2024-03-01", until: "2024-03-01" })
    expect(old.cancelled).toBe(true)
    expect(store.result()).toBeUndefined()
    expect(store.loading()).toBe(true)
    old.succeed([agendaEntry(99)])
    expect(store.result()).toBeUndefined()
    reads.latest().succeed([agendaEntry(18, "2024-03-01")])
    expect(store.result()?.[0].orderId).toBe(18)
    owner.destroy()
  })
  it.each([false, true])(
    "retains verified same-query rows/empty=%s through retry errors, with no automatic replay",
    empty => {
      const { owner, store } = setup()
      const rows = empty ? [] : [agendaEntry()]
      load(store)
      reads.latest().succeed(rows)
      load(store)
      expect(store.refreshing()).toBe(true)
      expect(store.result()).toEqual(rows)
      reads.latest().fail()
      expect(store.result()).toEqual(rows)
      expect(store.error()?.code).toBe("FORBIDDEN")
      expect(store.refreshing()).toBe(false)
      expect(reads.calls).toHaveLength(2)
      load(store)
      reads.latest().succeed(rows)
      expect(store.error()).toBeUndefined()
      expect(reads.calls).toHaveLength(3)
      owner.destroy()
    }
  )
  it("performs a fresh finite read on explicit revisit without a cross-visit cache policy", () => {
    const a = setup()
    load(a.store)
    reads.latest().succeed([])
    a.owner.destroy()
    const b = setup()
    expect(b.store.result()).toBeUndefined()
    load(b.store)
    expect(reads.calls).toHaveLength(2)
    b.owner.destroy()
  })
  it.each(["unsubscribe", "destroy"] as const)("%s cancels caller-owned pending reads", mode => {
    const { owner, store } = setup()
    const sub = load(store),
      pending = reads.latest()
    if (mode === "unsubscribe") sub.unsubscribe()
    else owner.destroy()
    expect(pending.cancelled).toBe(true)
    expect(store.loading()).toBe(false)
    pending.succeed([agendaEntry(99)])
    expect(store.result()).toBeUndefined()
    if (mode !== "destroy") owner.destroy()
  })
  it.each([null, caller(20), caller(19, deadline - 1000)])(
    "clears and cancels on session loss/replacement",
    next => {
      const { owner, store } = setup()
      load(store)
      reads.latest().succeed([agendaEntry()])
      load(store)
      const old = reads.latest()
      sessions.next(next)
      expect(old.cancelled).toBe(true)
      expect(store.result()).toBeUndefined()
      expect(store.query()).toBeUndefined()
      expect(store.loading()).toBe(false)
      old.succeed([agendaEntry(99)])
      expect(store.result()).toBeUndefined()
      expect(reads.calls).toHaveLength(2)
      owner.destroy()
    }
  )
  it("preserves pending work and verified data on same-session renewal", () => {
    const { owner, store } = setup()
    load(store)
    reads.latest().succeed([agendaEntry()])
    load(store)
    const pending = reads.latest()
    sessions.next(caller())
    expect(pending.cancelled).toBe(false)
    expect(store.result()?.[0].orderId).toBe(17)
    pending.succeed([agendaEntry(18)])
    expect(store.result()?.[0].orderId).toBe(18)
    owner.destroy()
  })
  it("rejects an expired session before dispatch", () => {
    sessions.next(caller(19, 1))
    const { owner, store } = setup()
    load(store)
    expect(reads.calls).toHaveLength(0)
    expect(store.result()).toBeUndefined()
    owner.destroy()
  })
  it("dispatches no SSR reads or auth initialization, even when explicitly requested", () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    const { owner, store } = setup()
    load(store)
    expect(authFactory).not.toHaveBeenCalled()
    expect(readFactory).not.toHaveBeenCalled()
    expect(reads.calls).toHaveLength(0)
    owner.destroy()
  })
  it.each([
    { from: "", until: "" },
    { from: "2025-02-29", until: "2025-03-01" },
    { from: "2024-03-01", until: "2024-02-29" },
    { ...query(), staffId: 0 },
    { ...query(), staffId: 2147483648 },
    { ...query(), staffId: 1.5 }
  ])("rejects invalid queries without dispatch or changes to verified state", invalid => {
    const { owner, store } = setup()
    load(store)
    reads.latest().succeed([agendaEntry()])
    load(store, invalid)
    expect(reads.calls).toHaveLength(1)
    expect(store.result()?.[0].orderId).toBe(17)
    expect(store.error()).toBeUndefined()
    owner.destroy()
  })
  it.each(["throwError", "empty"] as const)(
    "normalizes %s into safe retryable read errors",
    action => {
      const { owner, store } = setup()
      load(store)
      reads.latest()[action]()
      expect(store.error()?.code).toBe(action === "empty" ? "INVALID_RESPONSE" : "UNKNOWN")
      expect(store.error()?.message).not.toContain("Private")
      expect(store.result()).toBeUndefined()
      expect(store.loading()).toBe(false)
      expect(reads.calls).toHaveLength(1)
      owner.destroy()
    }
  )
})
