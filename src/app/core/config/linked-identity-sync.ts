import { InjectionToken } from "@angular/core"

/**
 * Narrow, explicit seam for the identity the backend keeps shared between a CRM customer and its
 * IAM account: one name and one email live in both rows, so an edit on one side makes the other
 * side's cached presentation data stale.
 *
 * Each store owns its own cache, so this contract carries only "the other side may now show an
 * old name/email". Neither store imports the other; the composition root (`app.config.ts`) wires
 * these callbacks lazily, resolving the peer store through the root injector on first use, so
 * composing the application instantiates no extra store and dispatches no read.
 */
export interface LinkedIdentitySync {
  /**
   * Every IAM page variant may show the linked account's old name or email, and those values
   * decide filter membership, so all variants expire — rows are never patched locally.
   */
  invalidateUserPages(): void
  /**
   * CRM page variants expire for the same reason. A verified `customerId` also expires that
   * profile; `null` means the relation is not verified here and only variants are conservative.
   */
  invalidateCustomerIdentity(customerId: number | null): void
}

/**
 * Inert default. It keeps a store that is composed outside the application root (unit tests, a
 * standalone harness) working with its own cache only; the real wiring lives in the composition
 * root and is always the provider the application resolves.
 */
export const LINKED_IDENTITY_SYNC = new InjectionToken<LinkedIdentitySync>("linked.identity.sync", {
  providedIn: "root",
  factory: (): LinkedIdentitySync => ({
    invalidateUserPages: () => undefined,
    invalidateCustomerIdentity: () => undefined
  })
})
