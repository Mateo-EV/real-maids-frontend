import { computed, inject, Injector, Signal } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defaultIfEmpty,
  defer,
  EMPTY,
  finalize,
  Observable,
  of,
  take,
  takeUntil,
  tap
} from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { createKeyedReads, KeyedEntry, keyedState } from "@/app/shared/state/keyed-reads"
import { ReadResourceState } from "@/app/shared/state/read-resource"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import * as Actions from "../../application/use-cases/acquisition.use-cases"
import { LeadListQuery } from "../../domain/models/lead-list-query"
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
/**
 * Stored entry: the registry state plus the read projection the consumers already use.
 * `query` is the effective query the registry adopted for that key.
 */
interface AcquisitionEntry<Q, T> extends AcquisitionReadEntry<T> {
  readonly query: Q
}
type Page = PaginationResponse<Lead>
type FollowUpList = readonly LeadFollowUp[]
/** Normalized page query: paging is required and only verified filters survive. */
type PageQuery = LeadListQuery & Required<PaginationParams>
/** Catalogs are single-key registries; the query only carries the fixed cache key. */
type CatalogQuery = null
const catalogKey = "catalog"
const emptyEntry = <T>(): AcquisitionReadEntry<T> => ({
  data: undefined,
  loaded: false,
  loading: false,
  pendingReads: 0,
  refreshing: false,
  expires: 0,
  error: undefined
})
const emptyCatalog = <T>(): AcquisitionEntry<CatalogQuery, T> => ({
  ...emptyEntry<T>(),
  query: null
})
// A typed boundary only: the registry owns coordination and stores `result`, while the
// presentation surface keeps reading `data`/`loaded`/`pendingReads`.
const toKeyed = <Q, T>(entry: AcquisitionEntry<Q, T>): KeyedEntry<Q, T, CustomerError> => ({
  query: entry.query,
  result: entry.data,
  loading: entry.loading,
  refreshing: entry.refreshing,
  error: entry.error,
  expires: entry.expires
})
const fromKeyed = <Q, T>(entry: KeyedEntry<Q, T, CustomerError>): AcquisitionEntry<Q, T> => ({
  query: entry.query,
  data: entry.result,
  loaded: entry.result !== undefined,
  loading: entry.loading,
  // A key shares one joined flight, so a pending read is exactly one.
  pendingReads: entry.loading || entry.refreshing ? 1 : 0,
  refreshing: entry.refreshing,
  expires: entry.expires,
  error: entry.error
})
const toKeyedRecord = <Q, T>(
  entries: Readonly<Record<string, AcquisitionEntry<Q, T>>>
): Record<string, KeyedEntry<Q, T, CustomerError>> => {
  const keyed: Record<string, KeyedEntry<Q, T, CustomerError>> = {}
  for (const key of Object.keys(entries)) keyed[key] = toKeyed(entries[key])
  return keyed
}
const fromKeyedRecord = <Q, T>(
  entries: Readonly<Record<string, KeyedEntry<Q, T, CustomerError>>>
): Record<string, AcquisitionEntry<Q, T>> => {
  const stored: Record<string, AcquisitionEntry<Q, T>> = {}
  for (const key of Object.keys(entries)) stored[key] = fromKeyed(entries[key])
  return stored
}
const storedCatalog = <T>(
  entries: Readonly<Record<string, KeyedEntry<CatalogQuery, T, CustomerError>>>
): AcquisitionEntry<CatalogQuery, T> => {
  const entry = entries[catalogKey]
  return entry ? fromKeyed(entry) : emptyCatalog<T>()
}
const initialState = {
  origins: emptyCatalog<readonly LeadOrigin[]>(),
  stages: emptyCatalog<readonly FunnelStage[]>(),
  pages: {} as Readonly<Record<string, AcquisitionEntry<PageQuery, Page>>>,
  leads: {} as Readonly<Record<string, AcquisitionEntry<number, Lead>>>,
  followUps: {} as Readonly<Record<string, AcquisitionEntry<number, FollowUpList>>>,
  _pendingWrites: 0,
  writeError: undefined as CustomerError | undefined,
  mutationRevision: 0
}
/** Only verified positive int32 filter ids survive normalization; malformed input is dropped. */
const filterId = (value: number | undefined): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647
    ? value
    : undefined
const querySnapshot = (query: LeadListQuery): PageQuery => {
  const search = query.search?.trim(),
    originId = filterId(query.originId),
    stageId = filterId(query.stageId)
  return {
    offset: query.offset ?? 0,
    limit: query.limit ?? 20,
    ...(search ? { search } : {}),
    ...(originId === undefined ? {} : { originId }),
    ...(stageId === undefined ? {} : { stageId }),
    ...(typeof query.converted === "boolean" ? { converted: query.converted } : {})
  }
}
/** Active filters are part of the cache identity, so listings never collide. */
const pageKey = (query: LeadListQuery) => {
  const q = querySnapshot(query)
  return JSON.stringify([
    q.offset,
    q.limit,
    q.search ?? null,
    q.originId ?? null,
    q.stageId ?? null,
    q.converted ?? null
  ])
}

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
    // Verified results live exclusively in SignalStore; registries retain coordinators.
    let resetReads: () => void = () => undefined
    const scope = createSessionReadScope(() => resetReads())
    const normalizeError = (error: unknown) =>
      error instanceof CustomerError ? error : new CustomerError("UNEXPECTED")
    /** Admission refuses instead of throwing: the documented conflict failure is kept. */
    const conflict = () => new CustomerError("CONFLICT")
    /** Cold, single-emission requests; an empty completion is an invalid response. */
    const request = <T>(factory: () => Observable<Result<T, CustomerError>>) =>
      defer(factory).pipe(
        take(1),
        defaultIfEmpty(Result.failure(new CustomerError("INVALID_RESPONSE")))
      )
    const origins = createKeyedReads<CatalogQuery, readonly LeadOrigin[], CustomerError>({
      key: () => catalogKey,
      request: () => request(() => injector.get(Actions.ListLeadOriginsUseCase).execute()),
      state: keyedState<CatalogQuery, readonly LeadOrigin[], CustomerError>(
        () => ({ [catalogKey]: toKeyed(store.origins()) }),
        next => patchState(store, { origins: storedCatalog(next) })
      ),
      scope,
      ttl: 120000,
      normalizeError,
      overflow: conflict
    })
    const stages = createKeyedReads<CatalogQuery, readonly FunnelStage[], CustomerError>({
      key: () => catalogKey,
      request: () => request(() => injector.get(Actions.ListFunnelStagesUseCase).execute()),
      state: keyedState<CatalogQuery, readonly FunnelStage[], CustomerError>(
        () => ({ [catalogKey]: toKeyed(store.stages()) }),
        next => patchState(store, { stages: storedCatalog(next) })
      ),
      scope,
      ttl: 120000,
      normalizeError,
      overflow: conflict
    })
    const pages = createKeyedReads<PageQuery, Page, CustomerError>({
      key: pageKey,
      normalize: querySnapshot,
      request: query => request(() => injector.get(Actions.ListLeadsUseCase).execute(query)),
      // Effective server paging is remembered without changing the requested key; the
      // active filters stay part of the adopted query so revalidation keeps filtering.
      adopt: (query, page) => ({ ...query, offset: page.offset, limit: page.limit }),
      state: keyedState<PageQuery, Page, CustomerError>(
        () => toKeyedRecord(store.pages()),
        next => patchState(store, { pages: fromKeyedRecord(next) })
      ),
      scope,
      ttl: 30000,
      normalizeError,
      overflow: conflict
    })
    const leads = createKeyedReads<number, Lead, CustomerError>({
      key: String,
      request: id => request(() => injector.get(Actions.GetLeadUseCase).execute(id)),
      state: keyedState<number, Lead, CustomerError>(
        () => toKeyedRecord(store.leads()),
        next => patchState(store, { leads: fromKeyedRecord(next) })
      ),
      scope,
      ttl: 30000,
      normalizeError,
      overflow: conflict
    })
    const followUps = createKeyedReads<number, FollowUpList, CustomerError>({
      key: String,
      request: leadId =>
        request(() => injector.get(Actions.ListLeadFollowUpsUseCase).execute(leadId)),
      state: keyedState<number, FollowUpList, CustomerError>(
        () => toKeyedRecord(store.followUps()),
        next => patchState(store, { followUps: fromKeyedRecord(next) })
      ),
      scope,
      ttl: 30000,
      normalizeError,
      overflow: conflict
    })
    resetReads = () => {
      origins.reset()
      stages.reset()
      pages.reset()
      leads.reset()
      followUps.reset()
      patchState(store, { _pendingWrites: 0, writeError: undefined })
    }
    // Lead writes expire every page plus only the affected lead and follow-up list.
    const invalidateLead = (id: number, appendedFollowUp = false) => {
      pages.markMutated()
      leads.markMutated(entry => entry.query === id)
      if (appendedFollowUp) followUps.markMutated(entry => entry.query === id)
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
      loadOrigins: (force = false) => origins.read(null, force),
      loadStages: (force = false) => stages.read(null, force),
      loadLeads: (query: LeadListQuery = {}, force = false) =>
        pages.read(querySnapshot(query), force),
      loadLead: (id: number, force = false) => leads.read(id, force),
      loadFollowUps: (leadId: number, force = false) => followUps.read(leadId, force),
      /** Keep this subscription for the mounted view; selectors alone do not pin history. */
      observeLeads: (query: LeadListQuery = {}, force = false) =>
        pages.observe(querySnapshot(query), { force }),
      observeLead: (id: number, force = false) => leads.observe(id, { force }),
      observeFollowUps: (leadId: number, force = false) => followUps.observe(leadId, { force }),
      selectLeads: (query: LeadListQuery = {}): Signal<AcquisitionReadEntry<Page>> =>
        computed(() => store.pages()[pageKey(query)] ?? emptyEntry<Page>()),
      selectLead: (id: number): Signal<AcquisitionReadEntry<Lead>> =>
        computed(() => store.leads()[String(id)] ?? emptyEntry<Lead>()),
      selectFollowUps: (leadId: number): Signal<AcquisitionReadEntry<FollowUpList>> =>
        computed(() => store.followUps()[String(leadId)] ?? emptyEntry<FollowUpList>()),
      createOrigin: (params: CreateLeadOriginParams) =>
        write(
          () => injector.get(Actions.CreateLeadOriginUseCase).execute(params),
          () => origins.markMutated()
        ),
      updateOrigin: (params: UpdateLeadOriginParams) =>
        write(
          () => injector.get(Actions.UpdateLeadOriginUseCase).execute(params),
          () => origins.markMutated()
        ),
      createStage: (params: CreateFunnelStageParams) =>
        write(
          () => injector.get(Actions.CreateFunnelStageUseCase).execute(params),
          () => stages.markMutated()
        ),
      updateStage: (params: UpdateFunnelStageParams) =>
        write(
          () => injector.get(Actions.UpdateFunnelStageUseCase).execute(params),
          () => stages.markMutated()
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
