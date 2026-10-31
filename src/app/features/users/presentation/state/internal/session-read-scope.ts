import { isPlatformBrowser } from "@angular/common"
import { DestroyRef, inject, Injector, PLATFORM_ID } from "@angular/core"
import { Subject } from "rxjs"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"

/** Store-local lifecycle only: callers retain ownership of data and cache policy. */
export function createSessionReadScope(reset: () => void) {
  const injector = inject(Injector)
  const destroyRef = inject(DestroyRef)
  const browser = isPlatformBrowser(inject(PLATFORM_ID))
  const cancelled = new Subject<void>()
  let generation = 0
  let sessionKey: string | null = null
  let observing = false

  // The fixed session deadline identifies the session; access renewal does not.
  const identity = (session: AuthSession | null) =>
    session && (session.expiresAt === null || session.expiresAt > Date.now())
      ? JSON.stringify([session.id, session.email, session.expiresAt])
      : null

  const acceptSession = (session: AuthSession | null) => {
    const key = identity(session)
    if (key === sessionKey) return
    sessionKey = key
    generation++
    cancelled.next()
    reset()
  }

  destroyRef.onDestroy(() => {
    cancelled.next()
    reset()
  })

  return {
    cancelled$: cancelled.asObservable(),
    generation: () => generation,
    check(): boolean {
      if (!browser) return false
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
      return sessionKey !== null
    }
  }
}
