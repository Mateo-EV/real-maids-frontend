import { inject, Injectable } from "@angular/core"
import { PROPERTY_REPOSITORY } from "../../domain/repositories/property.repository"
import { CreatePropertyParams, UpdatePropertyParams } from "../../domain/params/property.params"

@Injectable({ providedIn: "root" })
export class ListCustomerPropertiesUseCase {
  private readonly repository = inject(PROPERTY_REPOSITORY)
  execute(customerId: number) {
    return this.repository.findByCustomer(customerId)
  }
}
@Injectable({ providedIn: "root" })
export class CreatePropertyUseCase {
  private readonly repository = inject(PROPERTY_REPOSITORY)
  execute(customerId: number, params: CreatePropertyParams) {
    return this.repository.create(customerId, params)
  }
}
@Injectable({ providedIn: "root" })
export class UpdatePropertyUseCase {
  private readonly repository = inject(PROPERTY_REPOSITORY)
  execute(customerId: number, params: UpdatePropertyParams) {
    return this.repository.update(customerId, params)
  }
}
@Injectable({ providedIn: "root" })
export class SetPropertyStatusUseCase {
  private readonly repository = inject(PROPERTY_REPOSITORY)
  execute(customerId: number, propertyId: number, isActive: boolean) {
    return this.repository.setStatus(customerId, propertyId, isActive)
  }
}
