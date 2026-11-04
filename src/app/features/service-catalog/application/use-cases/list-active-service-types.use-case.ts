import { inject, Injectable } from "@angular/core"
import { SERVICE_CATALOG_REPOSITORY } from "../../domain/repositories/service-catalog.repository"

@Injectable({ providedIn: "root" })
export class ListActiveServiceTypesUseCase {
  private readonly repository = inject(SERVICE_CATALOG_REPOSITORY)
  execute() {
    return this.repository.getActiveServiceTypes()
  }
}
