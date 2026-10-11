import { DOCUMENT, isPlatformBrowser } from "@angular/common"
import { DestroyRef, inject, Injectable, PLATFORM_ID } from "@angular/core"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { Subject } from "rxjs"
import { apiOrigin } from "../http/auth-http-policy"

export interface AuthCredentials {
  readonly token: string
  readonly refreshToken: string
  readonly accessExpiresAt: number
  readonly sessionExpiresAt: number
}
interface Envelope {
  readonly version: 1
  readonly origin: string
  // A local concurrency marker, not a backend session ID.
  readonly revision: string
  readonly credentials: AuthCredentials | null
}
export const nonblank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0
export const credentialToken = (value: unknown): value is string =>
  nonblank(value) && !/[\s\x00-\x1f\x7f]/.test(value)
export const deadline = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000

@Injectable({ providedIn: "root" })
export class AuthPersistentSession {
  readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private readonly document = inject(DOCUMENT)
  readonly changes = new Subject<void>()
  private disabled = false
  private expiryTimer: ReturnType<typeof setTimeout> | undefined
  readonly key = `real-maids.auth.v1:${this.origin ?? "unconfigured"}`

  constructor() {
    const view = this.browser ? this.document.defaultView : null
    const listener = (event: StorageEvent) => {
      if (
        event.key !== null &&
        event.key !== this.key &&
        !event.key.startsWith(`${this.key}:credentials:`)
      )
        return
      // Read actual storage; event.newValue may already be superseded.
      this.read()
      this.changes.next()
    }
    view?.addEventListener("storage", listener)
    inject(DestroyRef).onDestroy(() => {
      view?.removeEventListener("storage", listener)
      clearTimeout(this.expiryTimer)
      this.changes.complete()
    })
  }

  get locks(): LockManager | null {
    if (!this.browser) return null
    return this.document.defaultView?.navigator.locks ?? null
  }

  private get storage(): Storage | null {
    if (!this.browser || !this.origin || this.disabled) return null
    try {
      return this.document.defaultView?.localStorage ?? null
    } catch {
      this.disabled = true
      return null
    }
  }

  private credentialKey(revision: string): string {
    return `${this.key}:credentials:${revision}`
  }

  raw(): string | null {
    try {
      const storage = this.storage
      const active = storage?.getItem(this.key)
      if (!storage || !active) return null
      let metadata: Envelope
      try {
        metadata = JSON.parse(active) as Envelope
      } catch {
        return active
      }
      if (!metadata || !nonblank(metadata.revision)) return active
      const value = storage.getItem(this.credentialKey(metadata.revision))
      // A concurrent active-generation change makes this snapshot unusable.
      if (storage.getItem(this.key) !== active) return null
      let credentials: unknown = null
      if (value) {
        try {
          credentials = JSON.parse(value)
        } catch {
          credentials = value
        }
      }
      return JSON.stringify({ ...metadata, credentials })
    } catch {
      this.disabled = true
      this.changes.next()
      return null
    }
  }

  read(): AuthCredentials | null {
    const raw = this.raw()
    if (!raw) return null
    try {
      const envelope = JSON.parse(raw) as Envelope
      if (
        !envelope ||
        envelope.version !== 1 ||
        envelope.origin !== this.origin ||
        !nonblank(envelope.revision)
      )
        throw new Error("Invalid storage")
      if (envelope.credentials === null) return null
      const c = envelope.credentials
      if (
        !c ||
        !credentialToken(c.token) ||
        !credentialToken(c.refreshToken) ||
        !deadline(c.accessExpiresAt) ||
        !deadline(c.sessionExpiresAt) ||
        c.accessExpiresAt > c.sessionExpiresAt ||
        c.sessionExpiresAt <= Date.now()
      ) {
        throw new Error("Invalid credentials")
      }
      this.schedule(c.sessionExpiresAt)
      return {
        token: c.token,
        refreshToken: c.refreshToken,
        accessExpiresAt: c.accessExpiresAt,
        sessionExpiresAt: c.sessionExpiresAt
      }
    } catch {
      this.clear(raw)
      return null
    }
  }

  write(credentials: AuthCredentials | null, expected: string | null): boolean {
    try {
      const storage = this.storage
      if (!storage || this.raw() !== expected) return false
      const previous = expected ? this.envelope(expected) : null
      if (credentials) {
        if (!previous || previous.origin !== this.origin || previous.version !== 1) return false
        const active = storage.getItem(this.key)
        if (!active || this.envelope(active)?.revision !== previous.revision) return false
        const key = this.credentialKey(previous.revision)
        // Response commits modify only this generation's credentials, never the active marker.
        // Logout/new login can change the marker during this write without being overwritten.
        storage.setItem(key, JSON.stringify(credentials))
        if (storage.getItem(this.key) !== active) {
          storage.removeItem(key)
          return false
        }
        this.schedule(credentials.sessionExpiresAt)
      } else {
        const envelope: Envelope = {
          version: 1,
          origin: this.origin!,
          revision: crypto.randomUUID(),
          credentials: null
        }
        storage.setItem(this.key, JSON.stringify(envelope))
        if (previous) storage.removeItem(this.credentialKey(previous.revision))
        clearTimeout(this.expiryTimer)
      }
      return true
    } catch {
      this.disabled = true
      return false
    }
  }

  private envelope(raw: string): Envelope | null {
    try {
      const value = JSON.parse(raw) as Envelope
      return value && nonblank(value.revision) ? value : null
    } catch {
      return null
    }
  }

  clear(expected = this.raw()): void {
    this.write(null, expected)
    this.changes.next()
  }

  private schedule(expiresAt: number): void {
    clearTimeout(this.expiryTimer)
    this.expiryTimer = setTimeout(
      () => {
        this.read()
      },
      Math.min(Math.max(0, expiresAt - Date.now()), 2147483647)
    )
  }
}
