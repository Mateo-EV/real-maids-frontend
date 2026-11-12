import { computed, inject, Injector } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, EMPTY, finalize, Observable, of, takeUntil, tap } from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { createKeyedReads, KeyedEntry, keyedState } from "@/app/shared/state/keyed-reads"
import { ReadResourceState } from "@/app/shared/state/read-resource"
import { Result } from "@/app/shared/utils/result"
import {
  CreateCustomerContactUseCase,
  CreateCustomerPreferenceUseCase,
  ListCustomerContactsUseCase,
  ListCustomerPreferencesUseCase,
  UpdateCustomerContactUseCase,
  UpdateCustomerPreferenceUseCase
} from "../../application/use-cases/customer-relations.use-cases"
import { CustomerContact } from "../../domain/entities/customer-contact.entity"
import { CustomerPreference } from "../../domain/entities/customer-preference.entity"
import { CustomerError } from "../../domain/errors/customer.error"
import {
  CreateCustomerContactParams,
  CreateCustomerPreferenceParams,
  UpdateCustomerContactParams,
  UpdateCustomerPreferenceParams
} from "../../domain/params/customer-relations.params"
import { CustomerHistoryStore } from "./customer-history.store"

type RelationRead<T> = ReadResourceState<readonly T[], CustomerError>
type RelationEntry<T> = KeyedEntry<number, readonly T[], CustomerError>
type ContactRead = RelationRead<CustomerContact>
type PreferenceRead = RelationRead<CustomerPreference>

const RELATION_READ_TTL_MS = 120000
/** Only the inactive part of the history is bounded: an active or in-flight owner is kept. */
const UNBOUNDED_ACTIVE_READS = Number.POSITIVE_INFINITY
const RELATION_INACTIVE_HISTORY_LIMIT = 20

const emptyRead = <T>(): RelationRead<T> => ({
  data: [],
  loaded: false,
  pendingReads: 0,
  refreshing: false,
  expires: 0,
  error: undefined
})
const initialState = {
  contacts: {} as Record<number, ContactRead>,
  preferences: {} as Record<number, PreferenceRead>,
  pendingContactWrites: 0,
  pendingPreferenceWrites: 0,
  contactWriteError: undefined as CustomerError | undefined,
  preferenceWriteError: undefined as CustomerError | undefined
}

/** One shared flight per key, whatever the number of subscribers of that flight. */
const pendingReads = (entry: { loading: boolean; refreshing: boolean }): number =>
  entry.loading || entry.refreshing ? 1 : 0
/** Only a verified response produces `loaded` data; an unverified key reads as empty. */
const readOf = <T>(entry: RelationEntry<T> | undefined): RelationRead<T> =>
  entry
    ? {
        data: entry.result ?? [],
        loaded: entry.result !== undefined,
        pendingReads: pendingReads(entry),
        refreshing: entry.refreshing,
        expires: entry.expires,
        error: entry.error
      }
    : emptyRead<T>()
const toEntries = <T>(
  entries: Readonly<Record<number, RelationRead<T>>>
): Record<string, RelationEntry<T>> => {
  const keyed: Record<string, RelationEntry<T>> = {}
  for (const [key, entry] of Object.entries(entries))
    keyed[key] = {
      query: Number(key),
      result: entry.loaded ? entry.data : undefined,
      loading: !entry.loaded && (entry.pendingReads ?? 0) > 0,
      refreshing: entry.refreshing,
      error: entry.error,
      expires: entry.expires
    }
  return keyed
}
const fromEntries = <T>(
  entries: Readonly<Record<string, RelationEntry<T>>>
): Record<number, RelationRead<T>> => {
  const reads: Record<number, RelationRead<T>> = {}
  for (const [key, entry] of Object.entries(entries)) reads[Number(key)] = readOf(entry)
  return reads
}

export const CustomerRelationsStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withComputed(store => ({
    contactsLoading: computed(
      () =>
        store.pendingContactWrites() > 0 ||
        Object.values(store.contacts()).some(value => (value.pendingReads ?? 0) > 0)
    ),
    preferencesLoading: computed(
      () =>
        store.pendingPreferenceWrites() > 0 ||
        Object.values(store.preferences()).some(value => (value.pendingReads ?? 0) > 0)
    )
  })),
  withMethods(
    (
      store,
      listContacts = inject(ListCustomerContactsUseCase),
      listPreferences = inject(ListCustomerPreferencesUseCase),
      createContact = inject(CreateCustomerContactUseCase),
      updateContact = inject(UpdateCustomerContactUseCase),
      createPreference = inject(CreateCustomerPreferenceUseCase),
      updatePreference = inject(UpdateCustomerPreferenceUseCase),
      injector = inject(Injector)
    ) => {
      const normalizeError = (error: unknown) =>
        error instanceof CustomerError ? error : new CustomerError("UNEXPECTED")
      // Registry scopes check the auth session themselves; the reset keeps both families.
      const scope = createSessionReadScope(() => {
        contacts.reset()
        preferences.reset()
        patchState(store, initialState)
      })
      const contacts = createKeyedReads<number, readonly CustomerContact[], CustomerError>({
        key: id => String(id),
        request: id => listContacts.execute(id),
        state: keyedState(
          () => toEntries(store.contacts()),
          next => patchState(store, { contacts: fromEntries(next) })
        ),
        scope,
        ttl: RELATION_READ_TTL_MS,
        maxEntries: UNBOUNDED_ACTIVE_READS,
        inactiveHistoryLimit: RELATION_INACTIVE_HISTORY_LIMIT,
        normalizeError,
        overflow: () => new CustomerError("UNEXPECTED")
      })
      const preferences = createKeyedReads<number, readonly CustomerPreference[], CustomerError>({
        key: id => String(id),
        request: id => listPreferences.execute(id),
        state: keyedState(
          () => toEntries(store.preferences()),
          next => patchState(store, { preferences: fromEntries(next) })
        ),
        scope,
        ttl: RELATION_READ_TTL_MS,
        maxEntries: UNBOUNDED_ACTIVE_READS,
        inactiveHistoryLimit: RELATION_INACTIVE_HISTORY_LIMIT,
        normalizeError,
        overflow: () => new CustomerError("UNEXPECTED")
      })
      const selectContacts = (id: number): ContactRead => readOf(contacts.select(id))
      const selectPreferences = (id: number): PreferenceRead => readOf(preferences.select(id))
      function mutate<T>(
        kind: "contact" | "preference",
        id: number,
        request: () => Observable<Result<T, CustomerError>>
      ) {
        return defer(() => {
          if (!scope.check()) return EMPTY
          const generation = scope.generation()
          patchState(store, state =>
            kind === "contact"
              ? {
                  pendingContactWrites: state.pendingContactWrites + 1,
                  contactWriteError: undefined
                }
              : {
                  pendingPreferenceWrites: state.pendingPreferenceWrites + 1,
                  preferenceWriteError: undefined
                }
          )
          return defer(request).pipe(
            catchError((error: unknown) => of(Result.failure(normalizeError(error)))),
            tap(result => {
              if (generation !== scope.generation()) return
              result.either(
                () => {
                  // Only the written relation expires; a write never refreshes its key.
                  if (kind === "contact") contacts.invalidate(String(id))
                  else preferences.invalidate(String(id))
                  // Cancelling readers invokes caller completion callbacks synchronously.
                  if (!scope.check() || generation !== scope.generation()) return
                  const history = injector.get(CustomerHistoryStore)
                  if (!scope.check() || generation !== scope.generation()) return
                  history.invalidateCustomer(id)
                },
                error =>
                  patchState(
                    store,
                    kind === "contact"
                      ? { contactWriteError: error }
                      : { preferenceWriteError: error }
                  )
              )
            }),
            takeUntil(scope.cancelled$),
            finalize(() => {
              if (generation !== scope.generation()) return
              patchState(store, state =>
                kind === "contact"
                  ? { pendingContactWrites: state.pendingContactWrites - 1 }
                  : { pendingPreferenceWrites: state.pendingPreferenceWrites - 1 }
              )
            })
          )
        })
      }
      return {
        selectContacts,
        selectPreferences,
        loadContacts(
          id: number,
          force = false
        ): Observable<Result<readonly CustomerContact[], CustomerError>> {
          return contacts.read(id, force)
        },
        loadPreferences(
          id: number,
          force = false
        ): Observable<Result<readonly CustomerPreference[], CustomerError>> {
          return preferences.read(id, force)
        },
        createContact(id: number, params: CreateCustomerContactParams) {
          return mutate("contact", id, () => createContact.execute(id, params))
        },
        updateContact(id: number, params: UpdateCustomerContactParams) {
          return mutate("contact", id, () => updateContact.execute(id, params))
        },
        createPreference(id: number, params: CreateCustomerPreferenceParams) {
          return mutate("preference", id, () => createPreference.execute(id, params))
        },
        updatePreference(id: number, params: UpdateCustomerPreferenceParams) {
          return mutate("preference", id, () => updatePreference.execute(id, params))
        }
      }
    }
  )
)
