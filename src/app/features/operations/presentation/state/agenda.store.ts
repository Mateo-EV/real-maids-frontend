import { inject, Injector } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defaultIfEmpty,
  defer,
  EMPTY,
  finalize,
  Observable,
  of,
  Subject,
  take,
  takeUntil,
  tap
} from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { Result } from "@/app/shared/utils/result"
import { GetAgendaUseCase } from "../../application/use-cases/get-agenda.use-case"
import { OperationsError, OperationsErrorCode } from "../../domain/errors/operations.error"
import { AgendaEntry } from "../../domain/models/operations-read.models"
import { AgendaQuery } from "../../domain/params/operations.params"
import { validAgendaQuery } from "../navigation/agenda-calendar"

const failure = (code: OperationsErrorCode): Result<AgendaEntry[], OperationsError> =>
  Result.failure(new OperationsError(code, "No se pudo consultar la agenda. Reintenta la lectura."))
const initial = {
  query: undefined as AgendaQuery | undefined,
  result: undefined as AgendaEntry[] | undefined,
  loading: false,
  refreshing: false,
  error: undefined as OperationsError | undefined
}

// Deliberately page-provided: one finite read state, no root cache or TTL.
export const AgendaStore = signalStore(
  withState(initial),
  withMethods(store => {
    const injector = inject(Injector)
    const replaced = new Subject<void>()
    let revision = 0
    const scope = createSessionReadScope(() => {
      revision++
      replaced.next()
      patchState(store, initial)
    })
    return {
      loadAgenda(input: AgendaQuery): Observable<Result<AgendaEntry[], OperationsError>> {
        let query: AgendaQuery | undefined
        try {
          query = {
            from: input.from,
            until: input.until,
            ...(input.staffId !== undefined ? { staffId: input.staffId } : {})
          }
        } catch {
          /* Invalid input is rejected without changing verified state. */
        }
        return defer(() => {
          if (!query || !validAgendaQuery(query)) return of(failure("INVALID_DATA"))
          if (!scope.check()) return of(failure("UNAUTHENTICATED"))
          const generation = scope.generation()
          const requestRevision = ++revision
          replaced.next()
          if (requestRevision !== revision || generation !== scope.generation()) return EMPTY
          const same =
            store.query()?.from === query.from &&
            store.query()?.until === query.until &&
            store.query()?.staffId === query.staffId
          const previous = same ? store.result() : undefined
          patchState(store, {
            query,
            result: previous,
            loading: previous === undefined,
            refreshing: previous !== undefined,
            error: undefined
          })
          const current = () => generation === scope.generation() && requestRevision === revision
          return defer(() => injector.get(GetAgendaUseCase).execute(query!)).pipe(
            take(1),
            defaultIfEmpty(failure("INVALID_RESPONSE")),
            catchError(() => of(failure("UNKNOWN"))),
            takeUntil(replaced),
            takeUntil(scope.cancelled$),
            tap(result => {
              if (!current() || !scope.check() || !current()) return
              if (result.success) patchState(store, { result: result.data, error: undefined })
              else patchState(store, { error: result.error })
            }),
            finalize(() => {
              if (current()) patchState(store, { loading: false, refreshing: false })
            })
          )
        })
      }
    }
  })
)
