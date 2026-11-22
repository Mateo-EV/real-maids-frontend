import { isPlatformBrowser } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiConflictContext } from "@/app/core/http/api-conflict-context"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { Result } from "@/app/shared/utils/result"
import { FieldOperationsError } from "../../domain/errors/field-operations.error"
import { StaffAbsence } from "../../domain/models/staff-absence"
import {
  CreateStaffAbsenceParams,
  SetStaffAbsenceStatusParams,
  StaffAbsenceQuery
} from "../../domain/params/field-operations.params"
import { failure, positiveId, staffError } from "./field-staff-http.validation"
import {
  absenceCreateBody,
  absenceDto,
  absencePage,
  absencePagination,
  absenceStatusBody
} from "./staff-absence-http.validation"

/**
 * Confirmed absence transport (M06/RF07/HU07/P07; S2–S7, S9–S11).
 *
 * Four cold calls: the paged listing with the documented filters, one absence by id, the own request
 * (`POST`, body `fechaInicio`/`fechaFin`/`motivo`) and the resolution write (`PATCH /{id}/estado`,
 * body `estado`/`observacion`). Nothing else is inferred: no staff id is sent for the own request —
 * the backend resolves the caller's staff record — and no client transition table, ACL or day
 * arithmetic is introduced.
 *
 * The reason text is a payload field, never a query parameter: it does not travel in a URL, it is not
 * logged here and it is not copied into any other contract.
 */
@Injectable({ providedIn: "root" })
export class StaffAbsencesHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private readonly url = `${this.origin}/api/ausencias`

  private request<T>(send: () => Observable<T>): Observable<Result<T, FieldOperationsError>> {
    return defer(() => {
      if (!this.browser || !this.origin) return of(Result.failure(failure("UNCONFIGURED")))
      return defer(send).pipe(
        map(value => Result.success(value)),
        catchError(error => of(Result.failure(staffError(error))))
      )
    })
  }

  getAbsences(query: StaffAbsenceQuery = {}) {
    const snapshot = { ...query }
    return this.request(() => {
      const params = absencePagination(snapshot)
      return this.http
        .get<unknown>(this.url, { params, transferCache: false })
        .pipe(map(value => absencePage(value, params)))
    })
  }

  getAbsenceById(id: number) {
    return this.request(() => {
      if (!positiveId(id)) throw failure("INVALID_DATA")
      // The detail read documents an absence as `404`, so the adapter — never the interceptor —
      // classifies it as the typed `NOT_FOUND`.
      return this.http
        .get<unknown>(`${this.url}/${id}`, { transferCache: false, context: apiConflictContext() })
        .pipe(map(value => absenceDto(value, id)))
    })
  }

  createAbsence(params: CreateStaffAbsenceParams) {
    // Getter-safe: the caller's input is captured now, never when the request is subscribed.
    const snapshot = { ...params }
    return this.request(() => {
      const body = absenceCreateBody(snapshot)
      return this.http
        .post<unknown>(this.url, body, { transferCache: false, context: apiConflictContext() })
        .pipe(map(value => absenceDto(value)))
    })
  }

  setAbsenceStatus(id: number, params: SetStaffAbsenceStatusParams) {
    const snapshot = { ...params }
    return this.request(() => {
      const { target, body } = absenceStatusBody(id, snapshot)
      // A resolution can be refused with a documented business error, so the body is preserved for
      // the adapter; the response must describe the same record in the requested state.
      return this.http
        .patch<unknown>(`${this.url}/${target}/estado`, body, {
          transferCache: false,
          context: apiConflictContext()
        })
        .pipe(
          map(value => absenceDto(value, target)),
          map((absence: StaffAbsence) =>
            absence.status === body.estado ? absence : absenceDto(undefined)
          )
        )
    })
  }
}
