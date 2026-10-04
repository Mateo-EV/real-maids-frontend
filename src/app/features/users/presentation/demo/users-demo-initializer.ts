import { isPlatformBrowser } from "@angular/common"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { firstValueFrom } from "rxjs"
import { RolesStore } from "../state/roles.store"
import { UserStore } from "../state/user.store"
import { DEMO_ROLES, demoUsers } from "./users-demo.fixture"

/** Explicit presentation-only opt-in: adapters remain empty by default. */
@Injectable({ providedIn: "root" })
export class UsersDemoInitializer {
  private readonly platform = inject(PLATFORM_ID)
  private readonly roles = inject(RolesStore)
  private readonly users = inject(UserStore)
  private initialization: Promise<void> | undefined
  private seedAttempted = false

  initialize(): Promise<void> {
    if (!isPlatformBrowser(this.platform)) return Promise.resolve()
    if (!this.initialization) {
      this.initialization = this.loadAndSeed().catch((error: unknown) => {
        this.initialization = undefined
        throw error
      })
    }
    return this.initialization
  }

  private async loadAndSeed(): Promise<void> {
    // Do not reload already-loaded or locally modified catalogs merely on route entry.
    if (!this.roles.loaded() && this.roles.roles().length === 0) {
      const result = await firstValueFrom(this.roles.loadRoles())
      if (!result.success) throw result.error
    }
    if (!this.users.loaded() && this.users.users().length === 0) {
      const result = await firstValueFrom(this.users.loadUsers())
      if (!result.success) throw result.error
    }
    // Only a wholly empty catalog is safe. Existing manual/demo data is never merged or replaced.
    // Once mutations begin, retry may reload but must not duplicate a partially seeded catalog.
    if (this.seedAttempted || this.roles.roles().length > 0 || this.users.users().length > 0) return
    this.seedAttempted = true
    const roleIds: number[] = []
    for (const params of DEMO_ROLES) {
      const result = await firstValueFrom(this.roles.createRole(params))
      if (!result.success) throw result.error
      roleIds.push(result.data.id)
    }
    for (const params of demoUsers(roleIds)) {
      const result = await firstValueFrom(this.users.createUser(params))
      if (!result.success) throw result.error
    }
  }
}
