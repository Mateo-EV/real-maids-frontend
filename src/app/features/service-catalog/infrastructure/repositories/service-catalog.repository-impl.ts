import { inject, Injectable } from "@angular/core"
import { of } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { ServiceCatalogError } from "../../domain/errors/service-catalog.error"
import { ServiceCatalogRepository } from "../../domain/repositories/service-catalog.repository"
import { ServiceCatalogHttpSource } from "../source/service-catalog-http.source"

const unsupported = () =>
  of(
    Result.failure(
      new ServiceCatalogError("UNSUPPORTED", "La administración del catálogo no está disponible.")
    )
  )

@Injectable({ providedIn: "root" })
export class ServiceCatalogRepositoryImpl implements ServiceCatalogRepository {
  private readonly source = inject(ServiceCatalogHttpSource)
  getActiveServiceTypes() {
    return this.source.getActiveServiceTypes()
  }

  // Proposed contracts have no confirmed backend endpoints. Never dispatch HTTP.
  getCategories: ServiceCatalogRepository["getCategories"] = unsupported
  createCategory: ServiceCatalogRepository["createCategory"] = unsupported
  updateCategory: ServiceCatalogRepository["updateCategory"] = unsupported
  getServiceTypes: ServiceCatalogRepository["getServiceTypes"] = unsupported
  createServiceType: ServiceCatalogRepository["createServiceType"] = unsupported
  updateServiceType: ServiceCatalogRepository["updateServiceType"] = unsupported
  getFrequencies: ServiceCatalogRepository["getFrequencies"] = unsupported
  createFrequency: ServiceCatalogRepository["createFrequency"] = unsupported
  updateFrequency: ServiceCatalogRepository["updateFrequency"] = unsupported
  getRates: ServiceCatalogRepository["getRates"] = unsupported
  createRate: ServiceCatalogRepository["createRate"] = unsupported
  updateRate: ServiceCatalogRepository["updateRate"] = unsupported
  getAdditionalServices: ServiceCatalogRepository["getAdditionalServices"] = unsupported
  createAdditionalService: ServiceCatalogRepository["createAdditionalService"] = unsupported
  updateAdditionalService: ServiceCatalogRepository["updateAdditionalService"] = unsupported
  getTasks: ServiceCatalogRepository["getTasks"] = unsupported
  createTask: ServiceCatalogRepository["createTask"] = unsupported
  updateTask: ServiceCatalogRepository["updateTask"] = unsupported
}
