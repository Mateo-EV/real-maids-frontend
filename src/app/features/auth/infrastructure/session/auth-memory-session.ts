import { isPlatformBrowser } from "@angular/common"
import { DestroyRef, inject, Injectable, PLATFORM_ID } from "@angular/core"
import { UserSession } from "../../domain/entities/user-session.entity"

@Injectable({ providedIn: "root" })
export class AuthMemorySession {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private credential: { token: string; session: UserSession } | null = null
  private expiryTimer: ReturnType<typeof setTimeout> | undefined

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clear())
  }

  establish(token: string, session: UserSession): boolean {
    this.clear()
    if (!this.browser || session.expiresAt === null || session.expiresAt <= Date.now()) return false
    this.credential = { token, session }
    this.scheduleExpiry()
    return true
  }

  current(): UserSession | null {
    if (!this.browser || !this.credential) return null
    if (this.credential.session.expiresAt! <= Date.now()) this.clear()
    return this.credential?.session ?? null
  }

  clear(): void {
    clearTimeout(this.expiryTimer)
    this.expiryTimer = undefined
    this.credential = null
  }

  private scheduleExpiry(): void {
    const session = this.current()
    if (!session) return
    // Browsers clamp long timeouts; recheck rather than expiring long-lived tokens early.
    this.expiryTimer = setTimeout(
      () => this.scheduleExpiry(),
      Math.min(session.expiresAt! - Date.now(), 2147483647)
    )
  }
}
