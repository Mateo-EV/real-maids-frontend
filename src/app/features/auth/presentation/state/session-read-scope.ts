import { isPlatformBrowser } from "@angular/common"
import { DestroyRef, inject, Injector, PLATFORM_ID } from "@angular/core"
import { Subject } from "rxjs"
import { ReadScope } from "@/app/shared/state/read-resource"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"

export interface SessionReadScope extends ReadScope {}

/** Store-local lifecycle only: callers retain ownership of data and cache policy. */
export function createSessionReadScope(reset: () => void): SessionReadScope {
  const injector = inject(Injector)
  const destroyRef = inject(DestroyRef)
  const browser = isPlatformBrowser(inject(PLATFORM_ID))
  const cancelled = new Subject<void>()
  let generation = 0
  let sessionKey: string | null = null
  let observing = false
  let checking = false
  let transitionDepth = 0
  let closed = false

  // The fixed session deadline identifies the session; access renewal does not.
  const identity = (session: AuthSession | null) =>
    session && (session.expiresAt === null || session.expiresAt > Date.now())
      ? JSON.stringify([session.id, session.email, session.expiresAt])
      : null

  const acceptSession = (session: AuthSession | null) => {
    if (closed) return
    const key = identity(session)
    if (key === sessionKey) return
    // Cancellation and reset can synchronously invoke consumers. Neither the old
    // cache nor a new request may be admitted until this entire transition settles.
    transitionDepth++
    try {
      sessionKey = key
      generation++
      cancelled.next()
      reset()
    } finally {
      transitionDepth--
    }
  }

  destroyRef.onDestroy(() => {
    closed = true
    generation++
    cancelled.next()
    reset()
  })

  return {
    cancelled$: cancelled.asObservable(),
    generation: () => generation,
    check(): boolean {
      if (!browser || closed || checking || transitionDepth > 0) return false
      // Also fence reentry from lazy Auth initialization and synchronous source
      // observation, before the outer check has finished establishing its scope.
      checking = true
      try {
        // Auth must initialize before its session source is observed.
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
        return !closed && sessionKey !== null
      } finally {
        checking = false
      }
    }
  }
}
