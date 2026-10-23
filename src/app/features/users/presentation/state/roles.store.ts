import { DestroyRef, inject, Injector, PLATFORM_ID } from "@angular/core"
import { isPlatformBrowser } from "@angular/common"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defer,
  EMPTY,
  finalize,
  Observable,
  of,
  shareReplay,
  Subject,
  takeUntil,
  tap
} from "rxjs"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { CreateRoleUseCase } from "../../application/use-cases/create-role.use-case"
import { DeleteRoleByIdUseCase } from "../../application/use-cases/delete-role-by-id.use-case"
import { GetRolesUseCase } from "../../application/use-cases/get-roles.use-case"
import { UpdateRoleByIdUseCase } from "../../application/use-cases/update-role-by-id.use-case"
import { Role } from "../../domain/entities/role.entity"
import { RoleError } from "../../domain/errors/role.error"
import { CreateRoleParams } from "../../domain/params/create-role.params"
import { UpdateRoleParams } from "../../domain/params/update-role.params"

export const ROLES_CATALOG_TTL_MS = 120000
const initialState = {
  roles: [] as Role[],
  loading: false,
  loaded: false,
  refreshing: false,
  expires: 0,
  error: undefined as RoleError | undefined
}
export const RolesStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withMethods(
    (
      store,
      getRoles = inject(GetRolesUseCase),
      createRole = inject(CreateRoleUseCase),
      updateRole = inject(UpdateRoleByIdUseCase),
      deleteRole = inject(DeleteRoleByIdUseCase)
    ) => {
      const injector = inject(Injector),
        destroyRef = inject(DestroyRef)
      const browser = isPlatformBrowser(inject(PLATFORM_ID)),
        cancelled = new Subject<void>()
      let pendingRequests = 0,
        catalogRevision = 0,
        latestLoad = 0,
        sessionGeneration = 0
      let sessionKey: string | null = null,
        observing = false
      let flight: Observable<Result<Role[], RoleError>> | undefined
      const identity = (session: AuthSession | null) =>
        session && (session.expiresAt === null || session.expiresAt > Date.now())
          ? JSON.stringify([session.id, session.email, session.expiresAt])
          : null
      const acceptSession = (session: AuthSession | null) => {
        const key = identity(session)
        if (key === sessionKey) return
        sessionKey = key
        sessionGeneration++
        catalogRevision++
        flight = undefined
        cancelled.next()
        patchState(store, initialState)
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
        cancelled.next()
        patchState(store, initialState)
      })
      const execute = <T>(
        request: () => Observable<Result<T, RoleError>>,
        onSuccess: (data: T) => void,
        isCurrent: () => boolean = () => true
      ): Observable<Result<T, RoleError>> =>
        defer(() => {
          if (!checkSession()) return EMPTY
          const generation = sessionGeneration
          pendingRequests++
          patchState(store, { loading: true, error: undefined })
          return defer(request).pipe(
            catchError((error: unknown) =>
              of(Result.failure(error instanceof RoleError ? error : new RoleError("UNEXPECTED")))
            ),
            tap(result => {
              if (generation !== sessionGeneration || !isCurrent()) return
              result.either(
                data => {
                  onSuccess(data)
                  patchState(store, { error: undefined })
                },
                error => patchState(store, { error })
              )
            }),
            takeUntil(cancelled),
            finalize(() => {
              pendingRequests--
              patchState(store, { loading: pendingRequests > 0 })
            })
          )
        })
      const invalidate = () => {
        catalogRevision++
        flight = undefined
        patchState(store, { expires: 0, refreshing: false })
      }
      const mutate = <T>(
        request: () => Observable<Result<T, RoleError>>,
        onSuccess: (data: T) => void
      ) =>
        defer(() => {
          if (!checkSession()) return EMPTY
          invalidate()
          return execute(request, data => {
            // Also fence reads started during the dispatched mutation.
            invalidate()
            onSuccess(data)
          })
        })
      return {
        loadRoles(force = false) {
          return defer(() => {
            if (!checkSession()) return EMPTY
            if (flight && !force) return flight
            if (!force && store.loaded() && store.expires() > Date.now())
              return of(Result.success(store.roles()))
            const requestId = ++latestLoad,
              revision = catalogRevision
            const request = execute(
              () => {
                patchState(store, { refreshing: store.loaded() })
                return getRoles.execute()
              },
              roles =>
                patchState(store, {
                  roles,
                  loaded: true,
                  expires: Date.now() + ROLES_CATALOG_TTL_MS
                }),
              () => requestId === latestLoad && revision === catalogRevision
            ).pipe(
              finalize(() => {
                if (flight === request) {
                  flight = undefined
                  patchState(store, { refreshing: false })
                }
              }),
              shareReplay({ bufferSize: 1, refCount: true })
            )
            flight = request
            return request
          })
        },
        createRole(params: CreateRoleParams) {
          return mutate(
            () => createRole.execute(params),
            role => {
              patchState(store, state => ({
                roles: [...state.roles.filter(r => r.id !== role.id), role]
              }))
            }
          )
        },
        updateRoleById(id: number, params: UpdateRoleParams) {
          return mutate(
            () => updateRole.execute(id, params),
            role => {
              patchState(store, state => ({
                roles: state.roles.map(r => (r.id === id ? role : r))
              }))
            }
          )
        },
        deleteRoleById(id: number) {
          return mutate(
            () => deleteRole.execute(id),
            () => {
              patchState(store, state => ({ roles: state.roles.filter(r => r.id !== id) }))
            }
          )
        }
      }
    }
  )
)
