import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { AdditionalService } from "../entities/additional-service.entity"
import { ServiceCategory } from "../entities/service-category.entity"
import { ServiceFrequency } from "../entities/service-frequency.entity"
import { ServiceRate } from "../entities/service-rate.entity"
import { ServiceTask } from "../entities/service-task.entity"
import { ServiceType } from "../entities/service-type.entity"
import { ServiceCatalogError } from "../errors/service-catalog.error"
import { ServiceTypeSummary } from "../models/service-type-summary"
import {
  CreateAdditionalServiceParams,
  CreateServiceCategoryParams,
  CreateServiceFrequencyParams,
  CreateServiceRateParams,
  CreateServiceTaskParams,
  CreateServiceTypeParams,
  UpdateAdditionalServiceParams,
  UpdateServiceCategoryParams,
  UpdateServiceFrequencyParams,
  UpdateServiceRateParams,
  UpdateServiceTaskParams,
  UpdateServiceTypeParams
} from "../params/catalog.params"

export interface ServiceCatalogRepository {
  // Confirmed read capability (CatalogoController).
  getActiveServiceTypes(): Observable<Result<ServiceTypeSummary[], ServiceCatalogError>>

  // Proposed catalog administration; no backend endpoint implied.
  getCategories(): Observable<Result<ServiceCategory[], ServiceCatalogError>>
  createCategory(
    params: CreateServiceCategoryParams
  ): Observable<Result<ServiceCategory, ServiceCatalogError>>
  updateCategory(
    id: number,
    params: UpdateServiceCategoryParams
  ): Observable<Result<ServiceCategory, ServiceCatalogError>>
  getServiceTypes(categoryId: number): Observable<Result<ServiceType[], ServiceCatalogError>>
  createServiceType(
    params: CreateServiceTypeParams
  ): Observable<Result<ServiceType, ServiceCatalogError>>
  updateServiceType(
    id: number,
    params: UpdateServiceTypeParams
  ): Observable<Result<ServiceType, ServiceCatalogError>>
  getFrequencies(): Observable<Result<ServiceFrequency[], ServiceCatalogError>>
  createFrequency(
    params: CreateServiceFrequencyParams
  ): Observable<Result<ServiceFrequency, ServiceCatalogError>>
  updateFrequency(
    id: number,
    params: UpdateServiceFrequencyParams
  ): Observable<Result<ServiceFrequency, ServiceCatalogError>>
  getRates(serviceTypeId: number): Observable<Result<ServiceRate[], ServiceCatalogError>>
  createRate(params: CreateServiceRateParams): Observable<Result<ServiceRate, ServiceCatalogError>>
  updateRate(
    id: number,
    params: UpdateServiceRateParams
  ): Observable<Result<ServiceRate, ServiceCatalogError>>
  getAdditionalServices(): Observable<Result<AdditionalService[], ServiceCatalogError>>
  createAdditionalService(
    params: CreateAdditionalServiceParams
  ): Observable<Result<AdditionalService, ServiceCatalogError>>
  updateAdditionalService(
    id: number,
    params: UpdateAdditionalServiceParams
  ): Observable<Result<AdditionalService, ServiceCatalogError>>
  getTasks(serviceTypeId: number): Observable<Result<ServiceTask[], ServiceCatalogError>>
  createTask(
    serviceTypeId: number,
    params: CreateServiceTaskParams
  ): Observable<Result<ServiceTask, ServiceCatalogError>>
  updateTask(
    serviceTypeId: number,
    id: number,
    params: UpdateServiceTaskParams
  ): Observable<Result<ServiceTask, ServiceCatalogError>>
}

export const SERVICE_CATALOG_REPOSITORY = new InjectionToken<ServiceCatalogRepository>(
  "service-catalog.repository"
)
