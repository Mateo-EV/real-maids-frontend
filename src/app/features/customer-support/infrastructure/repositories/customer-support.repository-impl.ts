import { inject, Injectable } from "@angular/core"
import { of } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { CustomerSupportError } from "../../domain/errors/customer-support.error"
import { CustomerSupportRepository } from "../../domain/repositories/customer-support.repository"
import { CustomerSupportHttpSource } from "../source/customer-support-http.source"

const unsupported = () => of(Result.failure(new CustomerSupportError("UNSUPPORTED")))

@Injectable({ providedIn: "root" })
export class CustomerSupportRepositoryImpl implements CustomerSupportRepository {
  private readonly source = inject(CustomerSupportHttpSource)

  getRequestTypes: CustomerSupportRepository["getRequestTypes"] = () =>
    this.source.getRequestTypes()
  getRequestsPage: CustomerSupportRepository["getRequestsPage"] = query =>
    this.source.getRequests(query)
  getRequest: CustomerSupportRepository["getRequest"] = id => this.source.getRequest(id)

  // The backend exposes these writes, but their transport belongs to their own slice.
  createRequest: CustomerSupportRepository["createRequest"] = unsupported
  addMessage: CustomerSupportRepository["addMessage"] = unsupported
  changeState: CustomerSupportRepository["changeState"] = unsupported

  // Proposed schema contracts: the backend has no status catalog or survey endpoint.
  getStatuses: CustomerSupportRepository["getStatuses"] = unsupported
  getSurveyByOrder: CustomerSupportRepository["getSurveyByOrder"] = unsupported
  submitSurvey: CustomerSupportRepository["submitSurvey"] = unsupported
}
