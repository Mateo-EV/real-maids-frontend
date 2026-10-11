import { inject } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, finalize, of, tap } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { GetAuditLogsUseCase } from "../../application/use-cases/get-audit-logs.use-case"
import { AuditLog } from "../../domain/entities/audit-log.entity"
import { AuditLogError } from "../../domain/errors/audit-log.error"
import { AuditQuery } from "../../domain/models/audit-query"

export const AuditLogsStore = signalStore(
  { providedIn: "root" },
  withState({
    items: [] as AuditLog[],
    total: 0,
    totalPages: 0,
    page: 0,
    size: 20,
    loading: false,
    error: undefined as AuditLogError | undefined,
    globalTotal: null as number | null
  }),
  withMethods((store, query = inject(GetAuditLogsUseCase)) => {
    let latest = 0
    let sequence = 0
    let globalSequence = 0
    return {
      load(params: AuditQuery) {
        const input = { ...params }
        return defer(() => {
          const request = ++latest
          const globalRequest = ++sequence
          patchState(store, { loading: true, error: undefined, items: [], total: 0, totalPages: 0 })
          return defer(() => query.execute(input)).pipe(
            catchError(() => of(Result.failure(new AuditLogError("UNEXPECTED")))),
            tap(result => {
              if (request !== latest) return
              if (result.success) {
                patchState(store, {
                  items: result.data.items,
                  total: result.data.total,
                  totalPages: result.data.totalPages,
                  page: result.data.page,
                  size: result.data.size
                })
                if (globalRequest >= globalSequence) {
                  globalSequence = globalRequest
                  patchState(store, { globalTotal: result.data.globalTotal })
                }
              } else patchState(store, { error: result.error })
            }),
            finalize(() => {
              if (request === latest) patchState(store, { loading: false })
            })
          )
        })
      },
      loadGlobalTotal() {
        return defer(() => {
          const request = ++sequence
          return defer(() => query.execute({ page: 0, size: 1 })).pipe(
            catchError(() => of(Result.failure(new AuditLogError("UNEXPECTED")))),
            tap(result => {
              if (result.success && request >= globalSequence) {
                globalSequence = request
                patchState(store, { globalTotal: result.data.globalTotal })
              }
            })
          )
        })
      }
    }
  })
)
