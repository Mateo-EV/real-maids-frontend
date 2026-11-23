import { computed, inject, Injector } from "@angular/core"
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
import {
  CreateCrmNoteUseCase,
  ListCrmEmailsUseCase,
  ListCrmNotesUseCase,
  ListEmailTemplatesUseCase,
  SendCrmEmailUseCase,
  UpdateCrmNoteUseCase
} from "../../application/use-cases/crm-communications.use-cases"
import { CrmNote } from "../../domain/entities/crm-note.entity"
import { CrmEmail } from "../../domain/entities/crm-email.entity"
import { EmailTemplate } from "../../domain/entities/email-template.entity"
import { CommunicationsError } from "../../domain/errors/communications.error"
import {
  CreateCrmNoteParams,
  CrmTarget,
  CrmTargetKind,
  SendCrmEmailParams,
  UpdateCrmNoteParams
} from "../../domain/params/crm-communications.params"

/** Verified projection of one keyed read; `denied` is an authoritative permission outcome. */
export interface CrmRead<T> extends ReadResourceState<T | null, CommunicationsError> {
  readonly denied: boolean
}

/** Paging is required for a page read and the owner is part of its identity. */
interface PageQuery {
  readonly kind: CrmTargetKind
  readonly id: number
  readonly offset: number
  readonly limit: number
}
type Entry<Q, T> = KeyedEntry<Q, T, CommunicationsError>
type Page<T> = PaginationResponse<T>
type NoteRead = CrmRead<Page<CrmNote>>
type EmailRead = CrmRead<Page<CrmEmail>>
type TemplatesRead = CrmRead<readonly EmailTemplate[]>

/** Communications are operational records: a short success window, never a business cache. */
const NOTE_READ_TTL_MS = 30000
const EMAIL_READ_TTL_MS = 30000
/** Editable templates behave like the other catalogs. */
const TEMPLATE_READ_TTL_MS = 120000
const UNBOUNDED_ACTIVE_READS = Number.POSITIVE_INFINITY
const INACTIVE_HISTORY_LIMIT = 20
const TEMPLATES_KEY = "templates"
/** Namespacing keeps the two families and the single template entry apart in one denial latch. */
const notesKey = (query: PageQuery) =>
  `notes:${JSON.stringify([query.kind, String(query.id), String(query.offset), String(query.limit)])}`
const emailsKey = (query: PageQuery) =>
  `emails:${JSON.stringify([query.kind, String(query.id), String(query.offset), String(query.limit)])}`

const initialState = {
  notes: {} as Readonly<Record<string, Entry<PageQuery, Page<CrmNote>>>>,
  emails: {} as Readonly<Record<string, Entry<PageQuery, Page<CrmEmail>>>>,
  templates: {} as Readonly<Record<string, Entry<null, readonly EmailTemplate[]>>>,
  /** Keys whose last authoritative answer was a denial; only a success clears them. */
  denied: {} as Readonly<Record<string, true>>,
  _pendingWrites: 0,
  writeError: undefined as CommunicationsError | undefined
}

const pendingReads = (entry: { loading: boolean; refreshing: boolean }): number =>
  entry.loading || entry.refreshing ? 1 : 0
/**
 * A denial is the primary fact for its key: the payload is dropped instead of presented as an empty
 * or stale list, and a later transient error cannot turn it back into staleness.
 */
const readOf = <T>(
  entry: KeyedEntry<unknown, T, CommunicationsError> | undefined,
  denied: boolean
): CrmRead<T> =>
  denied
    ? {
        data: null,
        loaded: false,
        pendingReads: entry ? pendingReads(entry) : 0,
        refreshing: false,
        expires: 0,
        error: new CommunicationsError("FORBIDDEN"),
        denied: true
      }
    : entry
      ? {
          data: entry.result ?? null,
          loaded: entry.result !== undefined,
          pendingReads: pendingReads(entry),
          refreshing: entry.refreshing,
          expires: entry.expires,
          error: entry.error,
          denied: false
        }
      : {
          data: null,
          loaded: false,
          pendingReads: 0,
          refreshing: false,
          expires: 0,
          error: undefined,
          denied: false
        }

/** Latch updates driven by the settled entries themselves, not by the consumer's request. */
function latchDenied(
  current: Readonly<Record<string, true>>,
  entries: Readonly<Record<string, KeyedEntry<unknown, unknown, CommunicationsError>>>
): Readonly<Record<string, true>> {
  let next: Record<string, true> | undefined
  for (const [key, entry] of Object.entries(entries)) {
    const denied = entry.error?.code === "FORBIDDEN"
    // A settled success clears the latch; the start of a retry is not an authorization.
    const authorized =
      entry.result !== undefined && entry.error === undefined && !entry.loading && !entry.refreshing
    if (denied && !current[key]) (next ??= { ...current })[key] = true
    else if (authorized && current[key]) {
      next ??= { ...current }
      delete next[key]
    }
  }
  return next ?? current
}

const pageQuery = (target: CrmTarget, query: PaginationParams = {}): PageQuery => ({
  kind: target.kind,
  id: target.id,
  offset: query.offset ?? 0,
  limit: query.limit ?? 20
})
/** The owner travels as the confirmed pair, never as a single ambiguous id. */
const owner = (query: PageQuery): CrmTarget => ({ kind: query.kind, id: query.id })
const sameOwner =
  (target: CrmTarget) =>
  (entry: KeyedEntry<PageQuery, unknown, CommunicationsError>): boolean =>
    entry.query.kind === target.kind && entry.query.id === target.id

/**
 * CRM communications presentation state (M03/RF03/HU03 context; RNF09/RNF10/RNF12). Root-owned,
 * caller-subscribed reads with success-only freshness, bounded inactive history, session/SSR fencing
 * and one write gate. It is a presentation cache, never an authorization decision.
 */
export const CrmCommunicationsStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withComputed(store => ({
    writing: computed(() => store._pendingWrites() > 0),
    loading: computed(() =>
      [
        ...Object.values(store.notes()),
        ...Object.values(store.emails()),
        ...Object.values(store.templates())
      ].some(entry => entry.loading)
    )
  })),
  withMethods(store => {
    const injector = inject(Injector)
    let resetReads: () => void = () => undefined
    const scope = createSessionReadScope(() => resetReads())
    const normalizeError = (error: unknown) =>
      error instanceof CommunicationsError ? error : new CommunicationsError("UNEXPECTED")
    /** Admission refuses instead of throwing: the documented conflict failure is kept. */
    const conflict = () => new CommunicationsError("CONFLICT")
    /** Cold, single-emission requests; an empty completion is an invalid response. */
    const request = <T>(factory: () => Observable<Result<T, CommunicationsError>>) =>
      defer(factory).pipe(
        take(1),
        defaultIfEmpty(Result.failure(new CommunicationsError("INVALID_RESPONSE")))
      )
    const notes = createKeyedReads<PageQuery, Page<CrmNote>, CommunicationsError>({
      key: notesKey,
      request: query =>
        request(() =>
          injector.get(ListCrmNotesUseCase).execute(owner(query), {
            offset: query.offset,
            limit: query.limit
          })
        ),
      // Effective server paging is remembered without changing the requested key.
      adopt: (query, page) => ({ ...query, offset: page.offset, limit: page.limit }),
      state: keyedState<PageQuery, Page<CrmNote>, CommunicationsError>(
        () => store.notes(),
        next =>
          patchState(store, current => ({
            notes: next,
            denied: latchDenied(current.denied, next)
          }))
      ),
      scope,
      ttl: NOTE_READ_TTL_MS,
      maxEntries: UNBOUNDED_ACTIVE_READS,
      inactiveHistoryLimit: INACTIVE_HISTORY_LIMIT,
      normalizeError,
      overflow: conflict,
      expireOnError: true
    })
    const emails = createKeyedReads<PageQuery, Page<CrmEmail>, CommunicationsError>({
      key: emailsKey,
      request: query =>
        request(() =>
          injector.get(ListCrmEmailsUseCase).execute(owner(query), {
            offset: query.offset,
            limit: query.limit
          })
        ),
      adopt: (query, page) => ({ ...query, offset: page.offset, limit: page.limit }),
      state: keyedState<PageQuery, Page<CrmEmail>, CommunicationsError>(
        () => store.emails(),
        next =>
          patchState(store, current => ({
            emails: next,
            denied: latchDenied(current.denied, next)
          }))
      ),
      scope,
      ttl: EMAIL_READ_TTL_MS,
      maxEntries: UNBOUNDED_ACTIVE_READS,
      inactiveHistoryLimit: INACTIVE_HISTORY_LIMIT,
      normalizeError,
      overflow: conflict,
      expireOnError: true
    })
    const templates = createKeyedReads<null, readonly EmailTemplate[], CommunicationsError>({
      key: () => TEMPLATES_KEY,
      request: () => request(() => injector.get(ListEmailTemplatesUseCase).execute()),
      state: keyedState<null, readonly EmailTemplate[], CommunicationsError>(
        () => store.templates(),
        next =>
          patchState(store, current => ({
            templates: next,
            denied: latchDenied(current.denied, next)
          }))
      ),
      scope,
      ttl: TEMPLATE_READ_TTL_MS,
      normalizeError,
      overflow: conflict,
      expireOnError: true
    })
    resetReads = () => {
      notes.reset()
      emails.reset()
      templates.reset()
      patchState(store, initialState)
    }
    // Writes are caller-owned: never cached, retried, replayed or subscribed by this root store.
    const write = <T>(
      request: () => Observable<Result<T, CommunicationsError>>,
      confirmed: (value: T, current: () => boolean) => void
    ): Observable<Result<T, CommunicationsError>> =>
      defer(() => {
        if (!scope.check()) return EMPTY
        const generation = scope.generation()
        patchState(store, { _pendingWrites: store._pendingWrites() + 1, writeError: undefined })
        return defer(request).pipe(
          take(1),
          defaultIfEmpty(Result.failure(new CommunicationsError("INVALID_RESPONSE"))),
          catchError((error: unknown) => of(Result.failure(normalizeError(error)))),
          tap(result => {
            if (generation !== scope.generation()) return
            result.either(
              value => confirmed(value, () => generation === scope.generation()),
              error => patchState(store, { writeError: error })
            )
          }),
          takeUntil(scope.cancelled$),
          finalize(() => {
            if (generation === scope.generation())
              patchState(store, { _pendingWrites: store._pendingWrites() - 1 })
          })
        )
      })
    return {
      selectNotes(target: CrmTarget, query: PaginationParams = {}): NoteRead {
        const key = notesKey(pageQuery(target, query))
        return readOf(notes.select(pageQuery(target, query)), !!store.denied()[key])
      },
      selectEmails(target: CrmTarget, query: PaginationParams = {}): EmailRead {
        const key = emailsKey(pageQuery(target, query))
        return readOf(emails.select(pageQuery(target, query)), !!store.denied()[key])
      },
      selectTemplates(): TemplatesRead {
        return readOf(templates.select(null), !!store.denied()[TEMPLATES_KEY])
      },
      loadNotes(
        target: CrmTarget,
        query: PaginationParams = {},
        force = false
      ): Observable<Result<Page<CrmNote>, CommunicationsError>> {
        return notes.read(pageQuery(target, query), force)
      },
      /** Keep this subscription while the panel is mounted; a selector alone does not pin history. */
      observeNotes(target: CrmTarget, query: PaginationParams = {}, force = false) {
        return notes.observe(pageQuery(target, query), { force })
      },
      loadEmails(
        target: CrmTarget,
        query: PaginationParams = {},
        force = false
      ): Observable<Result<Page<CrmEmail>, CommunicationsError>> {
        return emails.read(pageQuery(target, query), force)
      },
      observeEmails(target: CrmTarget, query: PaginationParams = {}, force = false) {
        return emails.observe(pageQuery(target, query), { force })
      },
      loadTemplates(
        force = false
      ): Observable<Result<readonly EmailTemplate[], CommunicationsError>> {
        return templates.read(null, force)
      },
      createNote(target: CrmTarget, params: CreateCrmNoteParams) {
        return write(
          () => injector.get(CreateCrmNoteUseCase).execute(target, params),
          () => notes.markMutated(sameOwner(target))
        )
      },
      /** Author-only rewrite; the backend answers 403 for anyone else and nothing is invalidated. */
      updateNote(target: CrmTarget, params: UpdateCrmNoteParams) {
        return write(
          () => injector.get(UpdateCrmNoteUseCase).execute(target, params),
          () => notes.markMutated(sameOwner(target))
        )
      },
      sendEmail(target: CrmTarget, params: SendCrmEmailParams) {
        return write(
          () => injector.get(SendCrmEmailUseCase).execute(target, params),
          () => emails.markMutated(sameOwner(target))
        )
      }
    }
  })
)
