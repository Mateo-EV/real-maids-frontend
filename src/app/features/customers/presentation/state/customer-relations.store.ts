import { computed, inject, Injector } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, EMPTY, finalize, Observable, of, takeUntil, tap } from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import {
  createReadResource,
  ReadResource,
  ReadResourceState
} from "@/app/shared/state/read-resource"
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

type ContactRead = ReadResourceState<readonly CustomerContact[], CustomerError>
type PreferenceRead = ReadResourceState<readonly CustomerPreference[], CustomerError>
const emptyContacts = (): ContactRead => ({
  data: [],
  loaded: false,
  pendingReads: 0,
  refreshing: false,
  expires: 0,
  error: undefined
})
const emptyPreferences = (): PreferenceRead => ({
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
      const contacts = new Map<number, ReadResource<readonly CustomerContact[], CustomerError>>()
      const preferences = new Map<
        number,
        ReadResource<readonly CustomerPreference[], CustomerError>
      >()
      const scope = createSessionReadScope(() => {
        contacts.forEach(resource => resource.reset())
        preferences.forEach(resource => resource.reset())
        contacts.clear()
        preferences.clear()
        patchState(store, initialState)
      })
      const normalizeError = (error: unknown) =>
        error instanceof CustomerError ? error : new CustomerError("UNEXPECTED")
      const selectContacts = (id: number): ContactRead => store.contacts()[id] ?? emptyContacts()
      const selectPreferences = (id: number): PreferenceRead =>
        store.preferences()[id] ?? emptyPreferences()
      function trimContacts() {
        const inactive = [...contacts].filter(([, value]) => !value.isPending())
        for (const [id] of inactive.slice(0, Math.max(0, inactive.length - 20))) {
          contacts.delete(id)
          patchState(store, state => {
            const entries = { ...state.contacts }
            delete entries[id]
            return { contacts: entries }
          })
        }
      }
      function trimPreferences() {
        const inactive = [...preferences].filter(([, value]) => !value.isPending())
        for (const [id] of inactive.slice(0, Math.max(0, inactive.length - 20))) {
          preferences.delete(id)
          patchState(store, state => {
            const entries = { ...state.preferences }
            delete entries[id]
            return { preferences: entries }
          })
        }
      }
      function contactResource(id: number) {
        let value = contacts.get(id)
        if (!value)
          value = createReadResource<readonly CustomerContact[], CustomerError>({
            state: {
              get: () => selectContacts(id),
              update: update =>
                patchState(store, state => {
                  const current = state.contacts[id] ?? emptyContacts()
                  return {
                    contacts: { ...state.contacts, [id]: { ...current, ...update(current) } }
                  }
                })
            },
            initialData: () => [],
            request: () => listContacts.execute(id),
            normalizeError,
            ttl: 120000,
            scope,
            forcePolicy: "join",
            cancelOnInvalidate: true
          })
        contacts.delete(id)
        contacts.set(id, value)
        return value
      }
      function preferenceResource(id: number) {
        let value = preferences.get(id)
        if (!value)
          value = createReadResource<readonly CustomerPreference[], CustomerError>({
            state: {
              get: () => selectPreferences(id),
              update: update =>
                patchState(store, state => {
                  const current = state.preferences[id] ?? emptyPreferences()
                  return {
                    preferences: { ...state.preferences, [id]: { ...current, ...update(current) } }
                  }
                })
            },
            initialData: () => [],
            request: () => listPreferences.execute(id),
            normalizeError,
            ttl: 120000,
            scope,
            forcePolicy: "join",
            cancelOnInvalidate: true
          })
        preferences.delete(id)
        preferences.set(id, value)
        return value
      }
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
                  if (kind === "contact") contacts.get(id)?.invalidate()
                  else preferences.get(id)?.invalidate()
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
          return defer(() => {
            if (!scope.check()) return EMPTY
            return contactResource(id).read(force).pipe(finalize(trimContacts))
          })
        },
        loadPreferences(
          id: number,
          force = false
        ): Observable<Result<readonly CustomerPreference[], CustomerError>> {
          return defer(() => {
            if (!scope.check()) return EMPTY
            return preferenceResource(id).read(force).pipe(finalize(trimPreferences))
          })
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
