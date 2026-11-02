import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Property } from "../entities/property.entity"
import { CustomerError } from "../errors/customer.error"
import { CreatePropertyParams, UpdatePropertyParams } from "../params/property.params"

/** Confirmed customer-scoped PropiedadController operations. */
export interface PropertyRepository {
  findByCustomer(customerId: number): Observable<Result<readonly Property[], CustomerError>>
  create(
    customerId: number,
    params: CreatePropertyParams
  ): Observable<Result<Property, CustomerError>>
  update(
    customerId: number,
    params: UpdatePropertyParams
  ): Observable<Result<Property, CustomerError>>
  setStatus(
    customerId: number,
    propertyId: number,
    isActive: boolean
  ): Observable<Result<Property, CustomerError>>
}
export const PROPERTY_REPOSITORY = new InjectionToken<PropertyRepository>("property.repository")
