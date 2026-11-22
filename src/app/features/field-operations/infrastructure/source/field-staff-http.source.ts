import { isPlatformBrowser } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { inject, Injectable, Injector, PLATFORM_ID } from "@angular/core"
import { catchError, defaultIfEmpty, defer, map, Observable, of, switchMap, take } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiConflictContext } from "@/app/core/http/api-conflict-context"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { Result } from "@/app/shared/utils/result"
import { FieldOperationsError } from "../../domain/errors/field-operations.error"
import {
  CreateFieldStaffParams,
  FieldStaffQuery,
  UpdateFieldStaffParams
} from "../../domain/params/field-operations.params"
import {
  failure,
  positiveId,
  staffDto,
  staffError,
  staffPage,
  staffPagination
} from "./field-staff-http.validation"
import {
  staffAccountMarker,
  staffWriteBody,
  staffWriteTarget
} from "./field-staff-write.validation"

@Injectable({ providedIn: "root" })
export class FieldStaffHttpSource {
  private readonly http = inject(HttpClient)
  private readonly injector = inject(Injector)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private readonly url = `${this.origin}/api/personal`
  private request<T>(send: () => Observable<T>): Observable<Result<T, FieldOperationsError>> {
    return defer(() => {
      if (!this.browser || !this.origin) return of(Result.failure(failure("UNCONFIGURED")))
      return defer(send).pipe(
        map(value => Result.success(value)),
        catchError(error => of(Result.failure(staffError(error))))
      )
    })
  }
  getStaff(query: FieldStaffQuery = {}) {
    const snapshot = { ...query }
    return this.request(() => {
      const params = staffPagination(snapshot)
      return this.http
        .get<unknown>(this.url, { params, transferCache: false })
        .pipe(map(value => staffPage(value, params)))
    })
  }
  getStaffById(id: number) {
    return this.request(() => {
      if (!positiveId(id)) throw failure("INVALID_DATA")
      // The detail read documents a `404` for a missing record, so the adapter — not the
      // interceptor — classifies it as its typed `NOT_FOUND`.
      return this.http
        .get<unknown>(`${this.url}/${id}`, {
          transferCache: false,
          context: apiConflictContext()
        })
        .pipe(map(value => staffDto(value, id)))
    })
  }
  /**
   * The access account is created with the record (`crearCuenta`/`password`), never by linking an
   * existing one: the staff form owns its own account, exactly like the customer editor.
   */
  createStaff(params: CreateFieldStaffParams) {
    // Getter-safe: the caller's input is captured now, never when the request is subscribed.
    const snapshot = { ...params }
    return this.request(() => {
      const body = staffWriteBody(snapshot)
      return this.http
        .post<unknown>(this.url, body, {
          transferCache: false,
          context: apiConflictContext()
        })
        .pipe(
          staffAccountMarker(),
          map(value => staffDto(value))
        )
    })
  }
  updateStaff(id: number, params: UpdateFieldStaffParams) {
    const snapshot = { ...params }
    return this.request(() => {
      const target = staffWriteTarget(id)
      const body = staffWriteBody(snapshot)
      // The write documents `404` for a missing record, so the adapter — not the interceptor —
      // classifies it as its typed `NOT_FOUND`, and the response must name the same record.
      return this.http
        .put<unknown>(`${this.url}/${target}`, body, {
          transferCache: false,
          context: apiConflictContext()
        })
        .pipe(
          staffAccountMarker(),
          map(value => staffDto(value, target))
        )
    })
  }
  getMyStaffProfile() {
    return this.request(() =>
      this.injector
        .get(ObserveAuthSessionUseCase)
        .execute()
        .pipe(
          take(1),
          defaultIfEmpty(null),
          switchMap(session =>
            // The own-profile read documents a `404` for "no staff profile linked"; it keeps its
            // typed `NOT_FOUND` and never falls back to a guessed staff ID.
            this.http
              .get<unknown>(`${this.url}/me`, {
                transferCache: false,
                context: apiConflictContext()
              })
              .pipe(map(value => staffDto(value, undefined, session?.id)))
          )
        )
    )
  }
}
