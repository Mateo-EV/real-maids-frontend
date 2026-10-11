import { inject, Injectable } from "@angular/core"
import {
  catchError,
  defaultIfEmpty,
  defer,
  Observable,
  observeOn,
  of,
  queueScheduler,
  switchMap
} from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserSession } from "../../domain/entities/user-session.entity"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { UserSessionPage } from "../../domain/models/user-session-page"
import { GetUserSessionsUseCase } from "./get-user-sessions.use-case"

// A read safety bound, not a backend limit. Exceeding it fails visibly, never truncates.
const MAX_PAGES = 1000
const SIZE = 20
export interface UserSessionCollection {
  items: UserSession[]
  total: number
}

@Injectable({ providedIn: "root" })
export class GetAllUserSessionsUseCase {
  private readonly query = inject(GetUserSessionsUseCase)
  execute(): Observable<Result<UserSessionCollection, UserSessionError>> {
    return defer(() => {
      const items: UserSession[] = []
      const ids = new Set<number>()
      const owners = new Map<number, UserSession>()
      let snapshot: UserSessionPage | undefined
      let currentCount = 0
      const invalid = () => {
        throw new UserSessionError("INVALID_RESPONSE")
      }
      const read = (index: number): Observable<Result<UserSessionCollection, UserSessionError>> =>
        defer(() => this.query.execute({ page: index, size: SIZE })).pipe(
          // Flatten synchronous test/cache responses without recursive stack growth.
          observeOn(queueScheduler),
          switchMap(result => {
            if (!result.success) return of(result)
            const page = result.data
            if (
              page.page !== index ||
              page.size !== SIZE ||
              !Number.isSafeInteger(page.total) ||
              page.total < 0 ||
              page.totalPages !== Math.ceil(page.total / SIZE) ||
              page.totalPages > MAX_PAGES ||
              page.items.length !== Math.min(SIZE, Math.max(0, page.total - index * SIZE))
            )
              invalid()
            if (
              snapshot &&
              (page.total !== snapshot.total || page.totalPages !== snapshot.totalPages)
            )
              invalid()
            snapshot ??= page
            for (const session of page.items) {
              const owner = owners.get(session.userId)
              if (
                ids.has(session.id) ||
                (owner &&
                  (owner.userName !== session.userName || owner.userEmail !== session.userEmail)) ||
                (items.length && session.startDate > items[items.length - 1].startDate)
              )
                invalid()
              if (session.isCurrent && ++currentCount > 1) invalid()
              ids.add(session.id)
              owners.set(session.userId, session)
              items.push(session)
            }
            if (index + 1 < page.totalPages) return read(index + 1)
            if (items.length !== page.total) invalid()
            return of(Result.success({ items, total: page.total }))
          })
        )
      return read(0)
    }).pipe(
      defaultIfEmpty(Result.failure(new UserSessionError("INVALID_RESPONSE"))),
      catchError(error =>
        of(
          Result.failure(
            error instanceof UserSessionError ? error : new UserSessionError("UNEXPECTED")
          )
        )
      )
    )
  }
}
