import { CreateUserUseCase } from "@/app/features/users/application/use-cases/create-user.use-case"
import { DeleteUserByIdUseCase } from "@/app/features/users/application/use-cases/delete-user-by-id.use-case"
import { GetUsersPageUseCase } from "../../application/use-cases/get-users-page.use-case"
import { UpdateUserStatusByIdUseCase } from "@/app/features/users/application/use-cases/update-user-status-by-id.use-case"
import { UpdateUserByIdUseCase } from "@/app/features/users/application/use-cases/update-user-by-id.use-case"
import { UserError } from "@/app/features/users/domain/errors/user.error"
import { CreateUserParams } from "@/app/features/users/domain/params/create-user.params"
import { UpdateUserParams } from "@/app/features/users/domain/params/update-user.params"
import { UserListQuery } from "../../domain/models/user-list-query"
import { User } from "../../domain/entities/user.entity"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { isPlatformBrowser } from "@angular/common"
import { DestroyRef, inject, Injector, PLATFORM_ID } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defaultIfEmpty,
  defer,
  EMPTY,
  finalize,
  Observable,
  of,
  shareReplay,
  Subject,
  take,
  takeUntil,
  tap
} from "rxjs"

type PageResult = Result<PaginationResponse<User>, UserError>
export function normalizeUserQuery(query: UserListQuery): UserListQuery {
  const search = query.search?.trim()
  return {
    offset: query.offset ?? 0,
    limit: query.limit ?? 20,
    ...(search ? { search } : {}),
    ...(query.roleId !== undefined ? { roleId: query.roleId } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {})
  }
}
export function userQueryKey(query: UserListQuery): string {
  const q = normalizeUserQuery(query)
  return JSON.stringify([
    String(q.offset),
    String(q.limit),
    q.search ?? "",
    String(q.roleId),
    String(q.isActive)
  ])
}

interface UserState {
  readonly mutationRevision: number
  readonly loading: boolean
  readonly error: UserError | undefined
}
const initialUserState: UserState = { mutationRevision: 0, loading: false, error: undefined }

export const UserStore = signalStore(
  { providedIn: "root" },
  withState(initialUserState),
  withMethods(store => {
    const injector = inject(Injector),
      destroyRef = inject(DestroyRef)
    const browser = isPlatformBrowser(inject(PLATFORM_ID))
    // Twenty query variants cover short navigation/search histories without an unbounded catalog.
    const cache = new Map<string, { page: PaginationResponse<User>; expires: number }>()
    const flights = new Map<string, Observable<PageResult>>()
    const cancelled = new Subject<void>()
    const invalidations = new Subject<"mutation" | "session">()
    let generation = 0,
      sessionGeneration = 0,
      pending = 0,
      observing = false,
      sessionKey: string | null = null
    const identity = (session: AuthSession | null) =>
      session && (session.expiresAt === null || session.expiresAt > Date.now())
        ? JSON.stringify([session.id, session.email, session.expiresAt])
        : null
    const invalidate = (reason: "mutation" | "session") => {
      generation++
      if (reason === "session") {
        sessionGeneration++
        patchState(store, { error: undefined })
      }
      cache.clear()
      flights.clear()
      cancelled.next()
      invalidations.next(reason)
    }
    const acceptSession = (session: AuthSession | null) => {
      const key = identity(session)
      if (key === sessionKey) return
      sessionKey = key
      invalidate("session")
    }
    const checkSession = () => {
      if (!browser) return false
      const auth = injector.get(AuthStore)
      if (!observing) {
        observing = true
        sessionKey = identity(auth.session())
        const subscription = injector
          .get(ObserveAuthSessionUseCase)
          .execute()
          .subscribe(acceptSession)
        destroyRef.onDestroy(() => subscription.unsubscribe())
      } else acceptSession(auth.session())
      return sessionKey !== null
    }
    destroyRef.onDestroy(() => {
      cache.clear()
      flights.clear()
      cancelled.next()
      cancelled.complete()
      invalidations.complete()
    })
    const execute = <T>(request: () => Observable<Result<T, UserError>>) =>
      defer(() => {
        pending++
        patchState(store, { loading: true, error: undefined })
        return defer(request).pipe(
          defaultIfEmpty(Result.failure(new UserError("INVALID_RESPONSE"))),
          catchError(error =>
            of(Result.failure(error instanceof UserError ? error : new UserError("UNEXPECTED")))
          ),
          finalize(() => {
            pending--
            patchState(store, { loading: pending > 0 })
          })
        )
      })
    const mutate = <T>(
      request: () => Observable<Result<T, UserError>>
    ): Observable<Result<T, UserError>> =>
      defer(() => {
        const started = sessionGeneration
        return execute(request).pipe(
          tap(result => {
            // An old session's dispatched write cannot roll back, but cannot affect the new view.
            if (started !== sessionGeneration) return
            if (!result.success) patchState(store, { error: result.error })
            if (result.success || result.error.code === "PARTIAL_UPDATE") {
              patchState(store, { mutationRevision: store.mutationRevision() + 1 })
              invalidate("mutation")
            }
          })
        )
      })
    return {
      observeInvalidations: () => invalidations.asObservable(),
      getCachedPage(query: UserListQuery): PaginationResponse<User> | undefined {
        // Stale entries remain bounded and session-guarded; only a successful read renews TTL.
        return checkSession() ? cache.get(userQueryKey(query))?.page : undefined
      },
      readPage(query: UserListQuery, force = false): Observable<PageResult> {
        const snapshot = normalizeUserQuery(query)
        return defer(() => {
          if (!checkSession()) return EMPTY
          const key = userQueryKey(snapshot),
            hit = cache.get(key)
          if (!force && hit && hit.expires > Date.now()) return of(Result.success(hit.page))
          const existing = flights.get(key)
          if (existing) return existing
          const started = generation
          const flight: Observable<PageResult> = defer(() =>
            injector.get(GetUsersPageUseCase).execute(snapshot)
          ).pipe(
            take(1),
            defaultIfEmpty(Result.failure(new UserError("INVALID_RESPONSE"))),
            catchError(error =>
              of(Result.failure(error instanceof UserError ? error : new UserError("UNEXPECTED")))
            ),
            takeUntil(cancelled),
            tap(result => {
              if (started !== generation || !result.success) return
              cache.delete(key)
              cache.set(key, { page: result.data, expires: Date.now() + 120000 })
              if (cache.size > 20) cache.delete(cache.keys().next().value!)
            }),
            finalize(() => {
              if (flights.get(key) === flight) flights.delete(key)
            }),
            shareReplay({ bufferSize: 1, refCount: true })
          )
          flights.set(key, flight)
          return flight
        })
      },
      createUser: (params: CreateUserParams) =>
        mutate(() => injector.get(CreateUserUseCase).execute(params)),
      updateUserById: (id: number, params: UpdateUserParams) =>
        mutate(() => injector.get(UpdateUserByIdUseCase).execute(id, params)),
      updateUserStatusById: (id: number, isActive: boolean) =>
        mutate(() => injector.get(UpdateUserStatusByIdUseCase).execute(id, isActive)),
      deleteUserById: (id: number) => mutate(() => injector.get(DeleteUserByIdUseCase).execute(id))
    }
  })
)
