import { isPlatformBrowser } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { Result } from "@/app/shared/utils/result"
import { OperationsError } from "../../domain/errors/operations.error"
import { AgendaEntry } from "../../domain/models/operations-read.models"
import { AgendaQuery } from "../../domain/params/operations.params"
import { requestError } from "./service-requests-http.validation"
import { agendaEntries, agendaParams } from "./agenda-http.validation"

@Injectable({ providedIn: "root" })
export class AgendaHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))

  getAgenda(query: AgendaQuery): Observable<Result<AgendaEntry[], OperationsError>> {
    let snapshot: unknown = null
    try {
      if (query && typeof query === "object" && !Array.isArray(query))
        snapshot = { from: query.from, until: query.until, staffId: query.staffId }
    } catch {
      snapshot = null
    }
    return defer(() => {
      if (!this.browser || !this.origin)
        return of(
          Result.failure(
            new OperationsError("UNCONFIGURED", "El servicio de agenda no está disponible.")
          )
        )
      return defer(() => {
        const params = agendaParams(snapshot)
        return this.http
          .get<unknown>(`${this.origin}/api/agenda`, { params, transferCache: false })
          .pipe(map(value => agendaEntries(value)))
      }).pipe(
        map(value => Result.success(value)),
        catchError((error: unknown) =>
          of(
            Result.failure(
              new OperationsError(requestError(error).code, "No se pudo consultar la agenda.")
            )
          )
        )
      )
    })
  }
}
