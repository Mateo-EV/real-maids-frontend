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

  createRequest: CustomerSupportRepository["createRequest"] = params =>
    this.source.createRequest(params)
  addMessage: CustomerSupportRepository["addMessage"] = (id, params) =>
    this.source.addMessage(id, params)
  changeState: CustomerSupportRepository["changeState"] = (id, params) =>
    this.source.changeState(id, params)

  // Proposed schema contracts: the backend has no status catalog or survey endpoint.
  getStatuses: CustomerSupportRepository["getStatuses"] = unsupported
  getSurveyByOrder: CustomerSupportRepository["getSurveyByOrder"] = unsupported
  submitSurvey: CustomerSupportRepository["submitSurvey"] = unsupported
}
