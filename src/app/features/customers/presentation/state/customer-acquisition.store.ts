import { computed, inject, Injector } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defaultIfEmpty,
  defer,
  EMPTY,
  finalize,
  filter,
  map,
  merge,
  Observable,
  of,
  shareReplay,
  Subject,
  switchMap,
  take,
  takeUntil,
  tap
} from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import {
  createReadResource,
  ReadResource,
  ReadResourceState
} from "@/app/shared/state/read-resource"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import * as Actions from "../../application/use-cases/acquisition.use-cases"
import { LeadOrigin } from "../../domain/entities/lead-origin.entity"
import { FunnelStage } from "../../domain/entities/funnel-stage.entity"
import { Lead } from "../../domain/entities/lead.entity"
import { LeadFollowUp } from "../../domain/entities/lead-follow-up.entity"
import { CustomerError } from "../../domain/errors/customer.error"
import {
  CreateLeadOriginParams,
  UpdateLeadOriginParams,
  CreateFunnelStageParams,
  UpdateFunnelStageParams,
  CreateLeadParams,
  UpdateLeadParams,
  CreateLeadFollowUpParams,
  ConvertLeadParams
} from "../../domain/params/acquisition.params"
import { CustomersStore } from "./customers.store"

export interface AcquisitionReadEntry<T> extends Readonly<
  ReadResourceState<T | undefined, CustomerError>
> {
  readonly loading: boolean
}
type Page = PaginationResponse<Lead>
type Flight<T> = ReadResource<T | undefined, CustomerError>
const emptyEntry = <T>(): AcquisitionReadEntry<T> => ({
  data: undefined,
  loaded: false,
  loading: false,
  pendingReads: 0,
  refreshing: false,
  expires: 0,
  error: undefined
})
const initialState = {
  origins: emptyEntry<readonly LeadOrigin[]>(),
  stages: emptyEntry<readonly FunnelStage[]>(),
  pages: {} as Readonly<Record<string, AcquisitionReadEntry<Page>>>,
  leads: {} as Readonly<Record<string, AcquisitionReadEntry<Lead>>>,
  followUps: {} as Readonly<Record<string, AcquisitionReadEntry<readonly LeadFollowUp[]>>>,
  _pendingWrites: 0,
  writeError: undefined as CustomerError | undefined,
  mutationRevision: 0
}
const querySnapshot = (query: PaginationParams): Required<PaginationParams> => ({
  offset: query.offset ?? 0,
  limit: query.limit ?? 20
})
const pageKey = (query: PaginationParams) => JSON.stringify([query.offset ?? 0, query.limit ?? 20])

/** Acquisition presentation data only; cached catalogs are never permission decisions. */
export const CustomerAcquisitionStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withComputed(store => ({
    writing: computed(() => store._pendingWrites() > 0),
    loading: computed(
      () =>
        store.origins().loading ||
        store.stages().loading ||
        [
          ...Object.values(store.pages()),
          ...Object.values(store.leads()),
          ...Object.values(store.followUps())
        ].some(entry => entry.loading)
    )
  })),
  withMethods(store => {
    const injector = inject(Injector)
    // Registries retain coordinators only. Verified results live exclusively in SignalStore.
    const pages = new Map<string, Flight<Page>>()
    const leads = new Map<string, Flight<Lead>>()
    const followUps = new Map<string, Flight<readonly LeadFollowUp[]>>()
    const activePages = new Map<string, number>()
    const activeLeads = new Map<string, number>()
    const activeFollowUps = new Map<string, number>()
    // Event-local shared flights, not a second result cache. Even synchronous failures
    // fan out once per mutation, and only caller-owned observers subscribe.
    const refreshes = new Subject<{
      pages: ReadonlyMap<string, Observable<Result<Page | undefined, CustomerError>>>
      leads: ReadonlyMap<string, Observable<Result<Lead | undefined, CustomerError>>>
      followUps: ReadonlyMap<
        string,
        Observable<Result<readonly LeadFollowUp[] | undefined, CustomerError>>
      >
    }>()
    const scope = createSessionReadScope(() => {
      origins.reset()
      stages.reset()
      pages.forEach(resource => resource.reset())
      leads.forEach(resource => resource.reset())
      followUps.forEach(resource => resource.reset())
      pages.clear()
      leads.clear()
      followUps.clear()
      patchState(store, { ...initialState, mutationRevision: store.mutationRevision() })
    })
    const normalizeError = (error: unknown) =>
      error instanceof CustomerError ? error : new CustomerError("UNEXPECTED")
    // A typed adapter only: sharing/freshness/cancellation stay in the existing coordinator.
    const bindRead = <T>(
      get: () => AcquisitionReadEntry<T>,
      set: (entry: AcquisitionReadEntry<T>) => void,
      request: () => Observable<Result<T, CustomerError>>,
      ttl: number
    ): Flight<T> => {
      const resource = createReadResource<T | undefined, CustomerError>({
        state: {
          get,
          update: update => {
            const current = get(),
              patch = update(current),
              next = { ...current, ...patch }
            const settled = "data" in patch || patch.error !== undefined
            set({
              ...next,
              loading: !settled && !next.loaded && (next.pendingReads ?? resource.pendingReads) > 0,
              refreshing: !settled && next.refreshing
            })
          }
        },
        initialData: () => undefined,
        request: () =>
          defer(request).pipe(
            take(1),
            defaultIfEmpty(Result.failure(new CustomerError("INVALID_RESPONSE")))
          ),
        normalizeError,
        ttl,
        scope,
        forcePolicy: "join",
        cancelOnInvalidate: true
      })
      return resource
    }
    const origins = bindRead(
      () => store.origins(),
      entry => patchState(store, { origins: entry }),
      () => injector.get(Actions.ListLeadOriginsUseCase).execute(),
      120000
    )
    const stages = bindRead(
      () => store.stages(),
      entry => patchState(store, { stages: entry }),
      () => injector.get(Actions.ListFunnelStagesUseCase).execute(),
      120000
    )

    // Hard cap of twenty per context. In-flight views cannot be evicted to admit a new key.
    const admit = <T>(
      registry: Map<string, Flight<T>>,
      key: string,
      active: ReadonlyMap<string, number>,
      evict: (key: string) => void
    ): boolean => {
      if (registry.has(key) || registry.size < 20) return true
      const candidate = [...registry.keys()].find(
        key => !active.has(key) && !registry.get(key)!.isPending()
      )
      if (candidate === undefined) return false
      registry.delete(candidate)
      evict(candidate)
      return true
    }
    const loadLeads = (query: PaginationParams = {}, force = false) => {
      const snapshot = querySnapshot(query),
        key = pageKey(snapshot)
      return defer(() => {
        if (!scope.check()) return EMPTY
        if (
          !admit(pages, key, activePages, key => {
            const entries = { ...store.pages() }
            delete entries[key]
            patchState(store, { pages: entries })
          })
        )
          return of(Result.failure(new CustomerError("CONFLICT")))
        let resource = pages.get(key)
        if (!resource) {
          patchState(store, { pages: { ...store.pages(), [key]: emptyEntry<Page>() } })
          resource = bindRead(
            () => store.pages()[key] ?? emptyEntry<Page>(),
            entry => patchState(store, { pages: { ...store.pages(), [key]: entry } }),
            () => {
              const effective = store.pages()[key]?.data
              return injector
                .get(Actions.ListLeadsUseCase)
                .execute(
                  effective ? { offset: effective.offset, limit: effective.limit } : snapshot
                )
            },
            30000
          )
          pages.set(key, resource)
        }
        return resource.read(force)
      })
    }
    const loadLead = (id: number, force = false) =>
      defer(() => {
        if (!scope.check()) return EMPTY
        const key = String(id)
        if (
          !admit(leads, key, activeLeads, key => {
            const entries = { ...store.leads() }
            delete entries[key]
            patchState(store, { leads: entries })
          })
        )
          return of(Result.failure(new CustomerError("CONFLICT")))
        let resource = leads.get(key)
        if (!resource) {
          patchState(store, { leads: { ...store.leads(), [key]: emptyEntry<Lead>() } })
          resource = bindRead(
            () => store.leads()[key] ?? emptyEntry<Lead>(),
            entry => patchState(store, { leads: { ...store.leads(), [key]: entry } }),
            () => injector.get(Actions.GetLeadUseCase).execute(id),
            30000
          )
          leads.set(key, resource)
        }
        return resource.read(force)
      })
    const loadFollowUps = (leadId: number, force = false) =>
      defer(() => {
        if (!scope.check()) return EMPTY
        const key = String(leadId)
        if (
          !admit(followUps, key, activeFollowUps, key => {
            const entries = { ...store.followUps() }
            delete entries[key]
            patchState(store, { followUps: entries })
          })
        )
          return of(Result.failure(new CustomerError("CONFLICT")))
        let resource = followUps.get(key)
        if (!resource) {
          patchState(store, {
            followUps: { ...store.followUps(), [key]: emptyEntry<readonly LeadFollowUp[]>() }
          })
          resource = bindRead(
            () => store.followUps()[key] ?? emptyEntry<readonly LeadFollowUp[]>(),
            entry => patchState(store, { followUps: { ...store.followUps(), [key]: entry } }),
            () => injector.get(Actions.ListLeadFollowUpsUseCase).execute(leadId),
            30000
          )
          followUps.set(key, resource)
        }
        return resource.read(force)
      })
    /** Keep this subscription for the mounted view; selectors alone do not pin history. */
    const observeLeads = (query: PaginationParams = {}, force = false) => {
      const snapshot = querySnapshot(query),
        key = pageKey(snapshot)
      return defer(() => {
        if (!scope.check()) return EMPTY
        if (
          !pages.has(key) &&
          pages.size >= 20 &&
          [...pages.keys()].every(key => activePages.has(key) || pages.get(key)!.isPending())
        )
          return of(Result.failure(new CustomerError("CONFLICT")))
        activePages.set(key, (activePages.get(key) ?? 0) + 1)
        return merge(
          refreshes.pipe(
            map(batch => batch.pages.get(key)),
            filter(batch => batch !== undefined)
          ),
          of(loadLeads(snapshot, force))
        ).pipe(
          switchMap(read => read),
          takeUntil(scope.cancelled$),
          finalize(() => {
            const remaining = (activePages.get(key) ?? 1) - 1
            if (remaining) activePages.set(key, remaining)
            else activePages.delete(key)
          })
        )
      })
    }
    const observeLead = (id: number, force = false) =>
      defer(() => {
        if (!scope.check()) return EMPTY
        const key = String(id)
        if (
          !leads.has(key) &&
          leads.size >= 20 &&
          [...leads.keys()].every(key => activeLeads.has(key) || leads.get(key)!.isPending())
        )
          return of(Result.failure(new CustomerError("CONFLICT")))
        activeLeads.set(key, (activeLeads.get(key) ?? 0) + 1)
        return merge(
          refreshes.pipe(
            map(batch => batch.leads.get(key)),
            filter(batch => batch !== undefined)
          ),
          of(loadLead(id, force))
        ).pipe(
          switchMap(read => read),
          takeUntil(scope.cancelled$),
          finalize(() => {
            const remaining = (activeLeads.get(key) ?? 1) - 1
            if (remaining) activeLeads.set(key, remaining)
            else activeLeads.delete(key)
          })
        )
      })
    const observeFollowUps = (leadId: number, force = false) =>
      defer(() => {
        if (!scope.check()) return EMPTY
        const key = String(leadId)
        if (
          !followUps.has(key) &&
          followUps.size >= 20 &&
          [...followUps.keys()].every(
            key => activeFollowUps.has(key) || followUps.get(key)!.isPending()
          )
        )
          return of(Result.failure(new CustomerError("CONFLICT")))
        activeFollowUps.set(key, (activeFollowUps.get(key) ?? 0) + 1)
        return merge(
          refreshes.pipe(
            map(batch => batch.followUps.get(key)),
            filter(batch => batch !== undefined)
          ),
          of(loadFollowUps(leadId, force))
        ).pipe(
          switchMap(read => read),
          takeUntil(scope.cancelled$),
          finalize(() => {
            const remaining = (activeFollowUps.get(key) ?? 1) - 1
            if (remaining) activeFollowUps.set(key, remaining)
            else activeFollowUps.delete(key)
          })
        )
      })
    const invalidateLead = (id: number, appendedFollowUp = false) => {
      const key = String(id)
      pages.forEach(resource => resource.invalidate())
      leads.get(key)?.invalidate()
      if (appendedFollowUp) followUps.get(key)?.invalidate()
      const pageBatch = new Map<string, Observable<Result<Page | undefined, CustomerError>>>()
      const leadBatch = new Map<string, Observable<Result<Lead | undefined, CustomerError>>>()
      const followUpBatch = new Map<
        string,
        Observable<Result<readonly LeadFollowUp[] | undefined, CustomerError>>
      >()
      activePages.forEach((_, key) => {
        const resource = pages.get(key)
        if (resource)
          pageBatch.set(
            key,
            resource.read(true).pipe(shareReplay({ bufferSize: 1, refCount: true }))
          )
      })
      if (activeLeads.has(key) && leads.has(key))
        leadBatch.set(
          key,
          leads
            .get(key)!
            .read(true)
            .pipe(shareReplay({ bufferSize: 1, refCount: true }))
        )
      if (appendedFollowUp && activeFollowUps.has(key) && followUps.has(key))
        followUpBatch.set(
          key,
          followUps
            .get(key)!
            .read(true)
            .pipe(shareReplay({ bufferSize: 1, refCount: true }))
        )
      refreshes.next({ pages: pageBatch, leads: leadBatch, followUps: followUpBatch })
    }
    // Writes are caller-owned, never cached, retried, or subscribed by this root store.
    const write = <T>(
      request: () => Observable<Result<T, CustomerError>>,
      confirmed: (value: T, current: () => boolean) => void
    ): Observable<Result<T, CustomerError>> =>
      defer(() => {
        if (!scope.check()) return EMPTY
        const generation = scope.generation()
        patchState(store, { _pendingWrites: store._pendingWrites() + 1, writeError: undefined })
        return defer(request).pipe(
          take(1),
          defaultIfEmpty(Result.failure(new CustomerError("INVALID_RESPONSE"))),
          catchError((error: unknown) => of(Result.failure(normalizeError(error)))),
          tap(result => {
            if (generation !== scope.generation()) return
            if (result.success) {
              confirmed(result.data, () => generation === scope.generation())
              // Consumer-owned refresh callbacks may synchronously replace/logout the session.
              if (generation === scope.generation())
                patchState(store, { mutationRevision: store.mutationRevision() + 1 })
            } else patchState(store, { writeError: result.error })
          }),
          takeUntil(scope.cancelled$),
          finalize(() => {
            if (generation === scope.generation())
              patchState(store, { _pendingWrites: store._pendingWrites() - 1 })
          })
        )
      })
    return {
      loadOrigins: (force = false) => origins.read(force),
      loadStages: (force = false) => stages.read(force),
      loadLeads,
      loadLead,
      loadFollowUps,
      observeLeads,
      observeLead,
      observeFollowUps,
      selectLeads: (query: PaginationParams = {}) => {
        const key = pageKey(query)
        return computed(() => store.pages()[key] ?? emptyEntry<Page>())
      },
      selectLead: (id: number) => computed(() => store.leads()[String(id)] ?? emptyEntry<Lead>()),
      selectFollowUps: (leadId: number) =>
        computed(() => store.followUps()[String(leadId)] ?? emptyEntry<readonly LeadFollowUp[]>()),
      createOrigin: (params: CreateLeadOriginParams) =>
        write(
          () => injector.get(Actions.CreateLeadOriginUseCase).execute(params),
          () => origins.invalidate()
        ),
      updateOrigin: (params: UpdateLeadOriginParams) =>
        write(
          () => injector.get(Actions.UpdateLeadOriginUseCase).execute(params),
          () => origins.invalidate()
        ),
      createStage: (params: CreateFunnelStageParams) =>
        write(
          () => injector.get(Actions.CreateFunnelStageUseCase).execute(params),
          () => stages.invalidate()
        ),
      updateStage: (params: UpdateFunnelStageParams) =>
        write(
          () => injector.get(Actions.UpdateFunnelStageUseCase).execute(params),
          () => stages.invalidate()
        ),
      createLead: (params: CreateLeadParams) =>
        write(
          () => injector.get(Actions.CreateLeadUseCase).execute(params),
          lead => invalidateLead(lead.id)
        ),
      updateLead: (params: UpdateLeadParams) =>
        write(
          () => injector.get(Actions.UpdateLeadUseCase).execute(params),
          () => invalidateLead(params.id)
        ),
      addFollowUp: (params: CreateLeadFollowUpParams) =>
        write(
          () => injector.get(Actions.AddLeadFollowUpUseCase).execute(params),
          () => invalidateLead(params.leadId, true)
        ),
      convertLead: (params: ConvertLeadParams) =>
        write(
          () => injector.get(Actions.ConvertLeadUseCase).execute(params),
          (customer, current) => {
            invalidateLead(params.leadId)
            if (current()) injector.get(CustomersStore).invalidateCustomers(customer.id)
          }
        )
    }
  })
)
