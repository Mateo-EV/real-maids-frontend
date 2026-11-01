import { Injector } from "@angular/core"
import { firstValueFrom, of } from "rxjs"
import { expect, expectTypeOf, it } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { ServiceCatalogError } from "./errors/service-catalog.error"
import {
  SERVICE_CATALOG_REPOSITORY,
  ServiceCatalogRepository
} from "./repositories/service-catalog.repository"
import {
  CreateServiceRateParams,
  UpdateServiceRateParams,
  CreateServiceTaskParams
} from "./params/catalog.params"

it("provides a typed feature error through every repository capability and token", async () => {
  const error = new ServiceCatalogError("FORBIDDEN", "Catalog access denied")
  expect(error).toBeInstanceOf(Error)
  expect(error.name).toBe("ServiceCatalogError")
  expect(error.message).toBe("Catalog access denied")
  expect(error.code).toBe("FORBIDDEN")
  const fail = () => of(Result.failure(error))
  const repository: ServiceCatalogRepository = {
    getActiveServiceTypes: fail,
    getCategories: fail,
    createCategory: fail,
    updateCategory: fail,
    getServiceTypes: fail,
    createServiceType: fail,
    updateServiceType: fail,
    getFrequencies: fail,
    createFrequency: fail,
    updateFrequency: fail,
    getRates: fail,
    createRate: fail,
    updateRate: fail,
    getAdditionalServices: fail,
    createAdditionalService: fail,
    updateAdditionalService: fail,
    getTasks: fail,
    createTask: fail,
    updateTask: fail
  }
  const injector = Injector.create({
    providers: [{ provide: SERVICE_CATALOG_REPOSITORY, useValue: repository }]
  })
  expect(injector.get(SERVICE_CATALOG_REPOSITORY)).toBe(repository)
  for (const operation of Object.values(repository)) {
    const result = await firstValueFrom<Result<unknown, ServiceCatalogError>>(operation())
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe(error)
  }
})

it("uses the confirmed projection without inventing SQL-only active state", async () => {
  const summaries = [
    {
      id: 3,
      name: "Deep clean",
      description: null,
      estimatedDurationMinutes: 125,
      categoryId: 8,
      categoryName: "Specialized"
    }
  ]
  const read: ServiceCatalogRepository["getActiveServiceTypes"] = () =>
    of(Result.success(summaries))
  const result = await firstValueFrom(read())
  expect(result.success).toBe(true)
  if (result.success) expect(result.data).toEqual(summaries)
  expectTypeOf<Extract<"id" | "createdAt", keyof CreateServiceRateParams>>().toEqualTypeOf<never>()
  expectTypeOf<UpdateServiceRateParams["frequencyId"]>().toEqualTypeOf<number | null>()
  expectTypeOf<CreateServiceRateParams["price"]>().toEqualTypeOf<string>()
  expectTypeOf<
    Extract<"id" | "serviceTypeId", keyof CreateServiceTaskParams>
  >().toEqualTypeOf<never>()
})
