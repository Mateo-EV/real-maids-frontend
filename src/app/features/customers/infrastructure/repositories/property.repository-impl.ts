import { inject, Injectable } from "@angular/core"
import { PropertyRepository } from "../../domain/repositories/property.repository"
import { CreatePropertyParams, UpdatePropertyParams } from "../../domain/params/property.params"
import { PropertyHttpSource } from "../source/property-http.source"

@Injectable({ providedIn: "root" })
export class PropertyRepositoryImpl implements PropertyRepository {
  private readonly source = inject(PropertyHttpSource)
  findByCustomer(customerId: number) {
    return this.source.findByCustomer(customerId)
  }
  create(customerId: number, params: CreatePropertyParams) {
    return this.source.create(customerId, params)
  }
  update(customerId: number, params: UpdatePropertyParams) {
    return this.source.update(customerId, params)
  }
  setStatus(customerId: number, propertyId: number, isActive: boolean) {
    return this.source.setStatus(customerId, propertyId, isActive)
  }
}
