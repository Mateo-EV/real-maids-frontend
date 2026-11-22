import { computed, inject, Injector } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defaultIfEmpty,
  defer,
  finalize,
  map,
  Observable,
  of,
  take,
  takeUntil,
  tap
} from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { createKeyedReads, keyedState, KeyedEntry } from "@/app/shared/state/keyed-reads"
import { Result } from "@/app/shared/utils/result"
import {
  CreateStaffAbsenceUseCase,
  GetStaffAbsenceByIdUseCase,
  ListStaffAbsencesUseCase,
  SetStaffAbsenceStatusUseCase
} from "../../application/use-cases/staff-absences.use-cases"
import { FieldOperationsError } from "../../domain/errors/field-operations.error"
import {
  StaffAbsence,
  staffAbsenceDecisions,
  staffAbsenceMaxObservation,
  staffAbsenceMaxReason,
  staffAbsenceStatuses,
  StaffAbsenceDecision,
  StaffAbsenceStatus
} from "../../domain/models/staff-absence"
import {
  CreateStaffAbsenceParams,
  SetStaffAbsenceStatusParams,
  StaffAbsenceQuery
} from "../../domain/params/field-operations.params"

export interface StaffAbsenceReadEntry<T> {
  readonly result: T | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: FieldOperationsError | undefined
  readonly expires: number
}
type Page = PaginationResponse<StaffAbsence>
const empty = <T>(): StaffAbsenceReadEntry<T> => ({
  result: undefined,
  loading: false,
  refreshing: false,
  error: undefined,
  expires: 0
})
const error = (code: "UNAUTHENTICATED" | "UNAVAILABLE" | "INVALID_RESPONSE" | "UNKNOWN") =>
  new FieldOperationsError(code, "No se pudieron consultar las ausencias del personal.")
const failed = <T>(
  code: FieldOperationsError["code"],
  message = "Ausencia no confirmada."
): Result<T, FieldOperationsError> =>
  Result.failure(new FieldOperationsError(code, message)) as Result<T, FieldOperationsError>
const failure = <T>(
  code: FieldOperationsError["code"],
  message = "Ausencia no confirmada."
): Observable<Result<T, FieldOperationsError>> => defer(() => of(failed<T>(code, message)))
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647
const integer = (value: unknown, minimum: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
const calendar = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}
const status = (value: unknown): value is StaffAbsenceStatus =>
  typeof value === "string" && staffAbsenceStatuses.includes(value as StaffAbsenceStatus)
const decision = (value: unknown): value is StaffAbsenceDecision =>
  typeof value === "string" && staffAbsenceDecisions.includes(value as StaffAbsenceDecision)

/**
 * Snapshot once before admission. An unknown, getter-throwing or out-of-contract query resolves to
 * `undefined` and dispatches nothing; DTO validation still belongs to the source. The reason text is
 * never part of the key, so it cannot leak into a cache key, a URL or a debug projection.
 */
const normalize = (query: StaffAbsenceQuery): StaffAbsenceQuery | undefined => {
  try {
    if (!query || typeof query !== "object" || Array.isArray(query)) return undefined
    const { offset = 0, limit = 20, status: statusFilter, staffId, from, until } = query
    if (
      !integer(offset, 0) ||
      !integer(limit, 1) ||
      offset % limit !== 0 ||
      offset / limit > 2147483647 ||
      (statusFilter !== undefined && !status(statusFilter)) ||
      (staffId !== undefined && !positiveId(staffId)) ||
      (from !== undefined && !calendar(from)) ||
      (until !== undefined && !calendar(until)) ||
      (from !== undefined && until !== undefined && from > until)
    )
      return undefined
    return {
      offset,
      limit,
      ...(statusFilter !== undefined ? { status: statusFilter } : {}),
      ...(staffId !== undefined ? { staffId } : {}),
      ...(from !== undefined ? { from } : {}),
      ...(until !== undefined ? { until } : {})
    }
  } catch {
    return undefined
  }
}
const queryKey = (query: StaffAbsenceQuery) =>
  JSON.stringify([
    query.offset ?? 0,
    query.limit ?? 20,
    query.status ?? null,
    query.staffId ?? null,
    query.from ?? null,
    query.until ?? null
  ])
const initialState = {
  _pendingWrites: 0,
  _pages: {} as Readonly<Record<string, KeyedEntry<StaffAbsenceQuery, Page, FieldOperationsError>>>,
  _details: {} as Readonly<Record<string, KeyedEntry<number, StaffAbsence, FieldOperationsError>>>
}

/**
 * Staff absences (M06/RF07/HU07/P07; S2–S7, S9–S11) — the root presentation boundary both audiences
 * read: the employee's own list at `/staff/absences` and the HR review at `/admin/staff/absences`.
 *
 * Paged and detail reads reuse the shared resources/session scope: 30000 ms success-only freshness
 * checked on reads and revisits without polling, share of ref-counted flights, a 20-entry pinned
 * registry per family, verified same-key data kept on failure and session/SSR fencing. The scope is
 * caller-relative in both audiences — the backend resolves whose absences a read returns — so no
 * consumer sends a staff id it inferred from the session.
 *
 * Writes share one pending gate on this store: a duplicate submit is refused before dispatch, not
 * queued. Only a confirmed current-generation success invalidates the affected entries — every page
 * plus the resolved record — and observed keys re-read once. A failed write invalidates nothing, the
 * reason text never enters a key or a message, and cancellation cannot undo a dispatched write.
 */
export const StaffAbsencesStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withComputed(store => ({ writing: computed(() => store._pendingWrites() > 0) })),
  withMethods(store => {
    const injector = inject(Injector)
    const resets: (() => void)[] = []
    const scope = createSessionReadScope(() => {
      resets.forEach(reset => reset())
      patchState(store, initialState)
    })
    const settle = <T>(source: Observable<Result<T, FieldOperationsError>>) =>
      source.pipe(take(1), defaultIfEmpty(Result.failure(error("INVALID_RESPONSE"))))
    /**
     * A denial is authoritative, not a stale-data event: when the server answers `FORBIDDEN` the
     * verified payload of that key — the rows and their reason text — is dropped instead of kept.
     * A transient failure still keeps same-key data, which is the difference the consumers rely on.
     */
    const scrubbed = <T>(
      source: Observable<Result<T, FieldOperationsError>>,
      drop: () => void
    ): Observable<Result<T, FieldOperationsError>> =>
      source.pipe(
        tap(result => {
          if (!result.success && result.error.code === "FORBIDDEN") drop()
        })
      )
    const normalizeError = (value: unknown) =>
      value instanceof FieldOperationsError ? value : error("UNKNOWN")
    const pages = createKeyedReads<StaffAbsenceQuery, Page, FieldOperationsError>({
      key: queryKey,
      request: query => settle(injector.get(ListStaffAbsencesUseCase).execute(query)),
      state: keyedState(
        () => store._pages(),
        next => patchState(store, { _pages: next })
      ),
      scope,
      ttl: 30000,
      normalizeError,
      overflow: () => error("UNAVAILABLE"),
      // A failed read rescinds freshness instead of leaving the entry verified.
      expireOnError: true
    })
    const details = createKeyedReads<number, StaffAbsence, FieldOperationsError>({
      key: id => String(id),
      request: id => settle(injector.get(GetStaffAbsenceByIdUseCase).execute(id)),
      state: keyedState(
        () => store._details(),
        next => patchState(store, { _details: next })
      ),
      scope,
      ttl: 30000,
      normalizeError,
      overflow: () => error("UNAVAILABLE"),
      expireOnError: true
    })
    resets.push(
      () => pages.reset(),
      () => details.reset()
    )
    /** Shared write gate: one pending absence write at a time, per store, with session fencing. */
    function write<T>(
      request: () => Observable<Result<T, FieldOperationsError>>,
      invalidate: (value: T) => void,
      validate: (value: T) => boolean
    ): Observable<Result<T, FieldOperationsError>> {
      return defer((): Observable<Result<T, FieldOperationsError>> => {
        if (!scope.check()) return failure<T>("UNAUTHENTICATED")
        if (store._pendingWrites())
          return of(failed<T>("CONFLICT", "Ya hay una operación de ausencia en curso."))
        const generation = scope.generation()
        const current = () => scope.check() && generation === scope.generation()
        patchState(store, { _pendingWrites: store._pendingWrites() + 1 })
        return defer(request).pipe(
          take(1),
          defaultIfEmpty(failed<T>("INVALID_RESPONSE")),
          map((result: Result<T, FieldOperationsError>): Result<T, FieldOperationsError> =>
            result.success && !validate(result.data)
              ? failed<T>("INVALID_RESPONSE", "Respuesta inesperada.")
              : result
          ),
          catchError((value: unknown) =>
            of(
              value instanceof FieldOperationsError
                ? failed<T>(value.code, value.message)
                : failed<T>("UNKNOWN")
            )
          ),
          tap(result => {
            if (!result.success || !current()) return
            // Confirmed current-generation success alone expires both registries; observed keys
            // share exactly one read each and inactive entries only expire.
            invalidate(result.data)
          }),
          takeUntil(scope.cancelled$),
          finalize(() => {
            if (generation === scope.generation())
              patchState(store, { _pendingWrites: store._pendingWrites() - 1 })
          })
        )
      })
    }
    return {
      createAbsence(
        params: CreateStaffAbsenceParams
      ): Observable<Result<StaffAbsence, FieldOperationsError>> {
        let snapshot: CreateStaffAbsenceParams
        try {
          const reason = typeof params?.reason === "string" ? params.reason.trim() : ""
          if (
            !calendar(params?.startDate) ||
            !calendar(params?.endDate) ||
            params.startDate > params.endDate ||
            reason.length === 0 ||
            reason.length > staffAbsenceMaxReason
          )
            return failure<StaffAbsence>("INVALID_DATA")
          snapshot = { startDate: params.startDate, endDate: params.endDate, reason }
        } catch {
          return failure<StaffAbsence>("INVALID_DATA")
        }
        return write(
          () => injector.get(CreateStaffAbsenceUseCase).execute(snapshot),
          () => pages.markMutated(),
          // A new request is pending by definition: an approved answer is not this write's result.
          created => created.status === "PENDIENTE"
        )
      },
      setAbsenceStatus(
        id: number,
        params: SetStaffAbsenceStatusParams
      ): Observable<Result<StaffAbsence, FieldOperationsError>> {
        let snapshot: SetStaffAbsenceStatusParams
        try {
          const observation = params?.observation
          if (
            !positiveId(id) ||
            !decision(params?.status) ||
            (observation !== null && observation !== undefined && typeof observation !== "string")
          )
            return failure<StaffAbsence>("INVALID_DATA")
          const trimmed = typeof observation === "string" ? observation.trim() : ""
          if (trimmed.length > staffAbsenceMaxObservation)
            return failure<StaffAbsence>("INVALID_DATA")
          snapshot = { status: params.status, observation: trimmed || null }
        } catch {
          return failure<StaffAbsence>("INVALID_DATA")
        }
        return write(
          () => injector.get(SetStaffAbsenceStatusUseCase).execute(id, snapshot),
          absence => {
            pages.markMutated()
            if (!scope.check()) return
            details.markMutated(entry => entry.query === absence.id)
          },
          absence => absence.id === id && absence.status === snapshot.status
        )
      },
      selectAbsences(query: StaffAbsenceQuery = {}): StaffAbsenceReadEntry<Page> {
        const snapshot = normalize(query)
        return snapshot ? (pages.select(snapshot) ?? empty<Page>()) : empty<Page>()
      },
      observeAbsences(
        query: StaffAbsenceQuery = {},
        force = false
      ): Observable<Result<Page, FieldOperationsError>> {
        const snapshot = normalize(query)
        if (!snapshot) return failure<Page>("INVALID_DATA")
        return scrubbed(pages.observe(snapshot, { force }), () => pages.evict(queryKey(snapshot)))
      },
      selectAbsence(id: number): StaffAbsenceReadEntry<StaffAbsence> {
        return positiveId(id)
          ? (details.select(id) ?? empty<StaffAbsence>())
          : empty<StaffAbsence>()
      },
      observeAbsence(
        id: number,
        force = false
      ): Observable<Result<StaffAbsence, FieldOperationsError>> {
        if (!positiveId(id)) return failure<StaffAbsence>("INVALID_DATA")
        return scrubbed(details.observe(id, { force }), () => details.evict(String(id)))
      }
    }
  })
)
