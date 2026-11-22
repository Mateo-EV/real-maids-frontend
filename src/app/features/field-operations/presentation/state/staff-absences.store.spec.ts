import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, firstValueFrom, Observable, of, Subject } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import {
  CreateStaffAbsenceUseCase,
  GetStaffAbsenceByIdUseCase,
  ListStaffAbsencesUseCase,
  SetStaffAbsenceStatusUseCase
} from "../../application/use-cases/staff-absences.use-cases"
import { FieldOperationsError } from "../../domain/errors/field-operations.error"
import { StaffAbsence, StaffAbsenceStatus } from "../../domain/models/staff-absence"
import { StaffAbsencesStore } from "./staff-absences.store"

const absence = (id = 9, status: StaffAbsenceStatus = "PENDIENTE"): StaffAbsence => ({
  id,
  staffId: 21,
  staffName: "Personal 21",
  startDate: "2026-04-06",
  endDate: "2026-04-08",
  days: 3,
  reason: "Viaje familiar",
  status,
  resolutionObservation: null,
  registeredAt: new Date("2026-04-01T10:00:00Z"),
  resolvedAt: null
})
const page = (total = 1, offset = 0, limit = 20): PaginationResponse<StaffAbsence> => ({
  items: total > offset ? [absence()] : [],
  total,
  offset,
  limit
})
type PageResult = Result<PaginationResponse<StaffAbsence>, FieldOperationsError>
type RecordResult = Result<StaffAbsence, FieldOperationsError>
const denied = () => Result.failure(new FieldOperationsError("FORBIDDEN", "Safe"))

describe("StaffAbsencesStore", () => {
  let store: InstanceType<typeof StaffAbsencesStore>
  let session: BehaviorSubject<AuthSession | null>
  let list: ReturnType<typeof vi.fn>,
    detail: ReturnType<typeof vi.fn>,
    create: ReturnType<typeof vi.fn>,
    resolve: ReturnType<typeof vi.fn>
  beforeEach(() => {
    session = new BehaviorSubject<AuthSession | null>(
      AuthSession.create("Personal Campo", "campo@example.test", "PERSONAL_CAMPO", null, 11)
    )
    list = vi.fn((): Observable<PageResult> => of(Result.success(page())))
    detail = vi.fn((): Observable<RecordResult> => of(Result.success(absence())))
    create = vi.fn((): Observable<RecordResult> => of(Result.success(absence())))
    resolve = vi.fn((): Observable<RecordResult> => of(Result.success(absence(9, "CANCELADA"))))
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: AuthStore, useValue: { session: () => session.value } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
        { provide: ListStaffAbsencesUseCase, useValue: { execute: list } },
        { provide: GetStaffAbsenceByIdUseCase, useValue: { execute: detail } },
        { provide: CreateStaffAbsenceUseCase, useValue: { execute: create } },
        { provide: SetStaffAbsenceStatusUseCase, useValue: { execute: resolve } }
      ]
    })
    store = TestBed.inject(StaffAbsencesStore)
  })
  afterEach(() => vi.restoreAllMocks())

  it("selects without dispatching and refuses an out-of-contract query", async () => {
    expect(store.selectAbsences().result).toBeUndefined()
    expect(store.selectAbsence(9).result).toBeUndefined()
    expect(list).not.toHaveBeenCalled()
    for (const query of [
      { offset: 5, limit: 10 },
      { status: "DUDOSA" as never },
      { staffId: 0 },
      { from: "2026-13-01" },
      { from: "2026-05-01", until: "2026-04-01" }
    ]) {
      expect(await firstValueFrom(store.observeAbsences(query))).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
    }
    expect(await firstValueFrom(store.observeAbsence(0))).toMatchObject({
      success: false,
      error: { code: "INVALID_DATA" }
    })
    expect(list).not.toHaveBeenCalled()
    expect(detail).not.toHaveBeenCalled()
  })

  it("keeps status and day-range windows independent and adopts effective metadata", async () => {
    const first = new Subject<PageResult>(),
      second = new Subject<PageResult>()
    list.mockReturnValueOnce(first).mockReturnValueOnce(second)
    store.observeAbsences({ status: "PENDIENTE" }).subscribe()
    store.observeAbsences({ status: "APROBADA" }).subscribe()
    expect(list).toHaveBeenCalledTimes(2)
    first.next(Result.success(page(12, 20, 10)))
    first.complete()
    expect(store.selectAbsences({ status: "PENDIENTE" }).result).toEqual(page(12, 20, 10))
    expect(store.selectAbsences({ status: "APROBADA" }).result).toBeUndefined()
    expect(store.selectAbsences({ status: "APROBADA" }).loading).toBe(true)
  })

  it("retains verified same-key rows on a transient failure and rescinds freshness", async () => {
    list.mockReturnValueOnce(of(Result.success(page())))
    await firstValueFrom(store.observeAbsences())
    expect(store.selectAbsences().expires).toBeGreaterThan(Date.now())
    // Only a denial drops the payload; every other failure keeps it with a retryable error.
    list.mockReturnValueOnce(of(Result.failure(new FieldOperationsError("UNAVAILABLE", "Safe"))))
    await firstValueFrom(store.observeAbsences({}, true))
    expect(store.selectAbsences().result).toEqual(page())
    expect(store.selectAbsences().error).toMatchObject({ code: "UNAVAILABLE" })
    expect(store.selectAbsences().expires).toBe(0)
  })

  it("scrubs verified payloads when the server denies the read, keeping transient failures stale", async () => {
    list.mockReturnValueOnce(of(Result.success(page())))
    detail.mockReturnValueOnce(of(Result.success(absence())))
    await firstValueFrom(store.observeAbsences())
    await firstValueFrom(store.observeAbsence(9))
    expect(store.selectAbsences().result).toEqual(page())
    expect(store.selectAbsence(9).result).toEqual(absence())

    // A transient failure keeps the same-key data with a retryable error.
    list.mockReturnValueOnce(of(Result.failure(new FieldOperationsError("UNAVAILABLE", "Safe"))))
    await firstValueFrom(store.observeAbsences({}, true))
    expect(store.selectAbsences().result).toEqual(page())
    expect(store.selectAbsences().error).toMatchObject({ code: "UNAVAILABLE" })

    // A denial is authoritative: the verified payload, including the reason text, is dropped.
    detail.mockReturnValueOnce(of(Result.failure(new FieldOperationsError("FORBIDDEN", "Safe"))))
    await firstValueFrom(store.observeAbsence(9, true))
    expect(store.selectAbsence(9).result).toBeUndefined()

    list.mockReturnValueOnce(of(Result.failure(new FieldOperationsError("FORBIDDEN", "Safe"))))
    await firstValueFrom(store.observeAbsences({}, true))
    expect(store.selectAbsences().result).toBeUndefined()

    // A later transient failure cannot resurrect data the server denied.
    list.mockReturnValueOnce(of(Result.failure(new FieldOperationsError("UNAVAILABLE", "Safe"))))
    detail.mockReturnValueOnce(of(Result.failure(new FieldOperationsError("UNAVAILABLE", "Safe"))))
    await firstValueFrom(store.observeAbsences({}, true))
    await firstValueFrom(store.observeAbsence(9, true))
    expect(store.selectAbsences().result).toBeUndefined()
    expect(store.selectAbsence(9).result).toBeUndefined()
  })

  it("serializes writes behind one pending gate and refuses a duplicate submit", async () => {
    const flight = new Subject<RecordResult>()
    create.mockReturnValue(flight)
    const first = firstValueFrom(
      store.createAbsence({ startDate: "2026-04-06", endDate: "2026-04-08", reason: "Viaje" })
    )
    expect(store.writing()).toBe(true)
    expect(
      await firstValueFrom(store.setAbsenceStatus(9, { status: "CANCELADA", observation: null }))
    ).toMatchObject({ success: false, error: { code: "CONFLICT" } })
    flight.next(Result.success(absence()))
    flight.complete()
    expect(await first).toMatchObject({ success: true })
    expect(store.writing()).toBe(false)
  })

  it("a confirmed request invalidates every page and refreshes only what is observed", async () => {
    const observed = new Subject<PageResult>(),
      withResult = new Subject<PageResult>()
    list.mockReturnValueOnce(observed).mockReturnValueOnce(withResult)
    store.observeAbsences({ status: "PENDIENTE" }).subscribe()
    const inactive = store.observeAbsences({ status: "APROBADA" }).subscribe()
    observed.next(Result.success(page()))
    withResult.next(Result.success(page()))
    // The second key keeps its verified row but has no observer left: a write only expires it.
    inactive.unsubscribe()
    list.mockClear()
    list.mockReturnValue(of(Result.success(page())))
    await firstValueFrom(
      store.createAbsence({ startDate: "2026-04-06", endDate: "2026-04-08", reason: "Viaje" })
    )
    // Exactly one re-read for the key this consumer observes; the inactive key only expires.
    expect(list).toHaveBeenCalledTimes(1)
    expect(store.selectAbsences({ status: "APROBADA" }).result).toEqual(page())
    expect(store.selectAbsences({ status: "APROBADA" }).expires).toBe(0)
  })

  it("enforces the documented request bounds: motivo 500 and observación 250", async () => {
    // The trimmed text is what travels, so padding around exactly 500 characters is still accepted.
    expect(
      await firstValueFrom(
        store.createAbsence({
          startDate: "2026-04-06",
          endDate: "2026-04-08",
          reason: `  ${"m".repeat(500)}  `
        })
      )
    ).toMatchObject({ success: true })
    expect(create).toHaveBeenCalledExactlyOnceWith({
      startDate: "2026-04-06",
      endDate: "2026-04-08",
      reason: "m".repeat(500)
    })
    expect(
      await firstValueFrom(
        store.createAbsence({
          startDate: "2026-04-06",
          endDate: "2026-04-08",
          reason: "m".repeat(501)
        })
      )
    ).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    expect(create).toHaveBeenCalledTimes(1)

    expect(
      await firstValueFrom(
        store.setAbsenceStatus(9, { status: "CANCELADA", observation: `  ${"o".repeat(250)} ` })
      )
    ).toMatchObject({ success: true })
    expect(resolve).toHaveBeenCalledExactlyOnceWith(9, {
      status: "CANCELADA",
      observation: "o".repeat(250)
    })
    expect(
      await firstValueFrom(
        store.setAbsenceStatus(9, { status: "CANCELADA", observation: "o".repeat(251) })
      )
    ).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it("rejects a created record the backend did not leave pending", async () => {
    create.mockReturnValue(of(Result.success(absence(9, "APROBADA"))))
    expect(
      await firstValueFrom(
        store.createAbsence({ startDate: "2026-04-06", endDate: "2026-04-08", reason: "Viaje" })
      )
    ).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })

  it("a failed write invalidates nothing and keeps verified rows", async () => {
    list.mockReturnValueOnce(of(Result.success(page())))
    await firstValueFrom(store.observeAbsences())
    list.mockClear()
    resolve.mockReturnValue(of(denied()))
    expect(
      await firstValueFrom(store.setAbsenceStatus(9, { status: "CANCELADA", observation: null }))
    ).toMatchObject({ success: false, error: { code: "FORBIDDEN" } })
    expect(list).not.toHaveBeenCalled()
    expect(store.selectAbsences().result).toEqual(page())
  })

  it("resolves the affected record and rejects a mismatched server answer", async () => {
    list.mockReturnValue(of(Result.success(page())))
    detail.mockReturnValue(of(Result.success(absence())))
    const pages = store.observeAbsences().subscribe()
    const record = store.observeAbsence(9).subscribe()
    // The resolution describes a different record: the answer is not accepted as the write result.
    resolve.mockReturnValue(of(Result.success(absence(10, "CANCELADA"))))
    expect(
      await firstValueFrom(store.setAbsenceStatus(9, { status: "CANCELADA", observation: null }))
    ).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    resolve.mockReturnValue(of(Result.success(absence(9, "RETIRADA"))))
    expect(
      await firstValueFrom(store.setAbsenceStatus(9, { status: "CANCELADA", observation: null }))
    ).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    expect(resolve).toHaveBeenCalledTimes(2)
    pages.unsubscribe()
    record.unsubscribe()
  })

  it("clears every entry and fences old work when the session is replaced", async () => {
    list.mockReturnValueOnce(of(Result.success(page())))
    await firstValueFrom(store.observeAbsences())
    expect(store.selectAbsences().result).toBeDefined()
    session.next(AuthSession.create("Other", "other@example.test", "PERSONAL_CAMPO", null, 12))
    expect(store.selectAbsences().result).toBeUndefined()
    expect(store.selectAbsence(9).result).toBeUndefined()
  })

  it("dispatching a write without a live session resolves to UNAUTHENTICATED and no call", async () => {
    session.next(null)
    expect(
      await firstValueFrom(
        store.createAbsence({ startDate: "2026-04-06", endDate: "2026-04-08", reason: "Viaje" })
      )
    ).toMatchObject({ success: false, error: { code: "UNAUTHENTICATED" } })
    expect(create).not.toHaveBeenCalled()
    expect(store.selectAbsences().result).toBeUndefined()
  })
})
