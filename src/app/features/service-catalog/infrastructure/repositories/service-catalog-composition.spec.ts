import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable, of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { ListActiveServiceTypesUseCase } from "../../application/use-cases/list-active-service-types.use-case"
import { ServiceCatalogError } from "../../domain/errors/service-catalog.error"
import { SERVICE_CATALOG_REPOSITORY } from "../../domain/repositories/service-catalog.repository"
import { provideServiceCatalogReads } from "../../service-catalog.providers"
import { ServiceCatalogHttpSource } from "../source/service-catalog-http.source"
import { ServiceCatalogRepositoryImpl } from "./service-catalog.repository-impl"

describe("Service catalog composition and application boundary", () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideServiceCatalogReads()]
    })
  )
  it("aliases the token to the root repository and delegates through the shared root source", () => {
    const source = TestBed.inject(ServiceCatalogHttpSource)
    const repository = TestBed.inject(SERVICE_CATALOG_REPOSITORY)
    expect(repository).toBe(TestBed.inject(ServiceCatalogRepositoryImpl))
    expect(repository).not.toBe(source)
    const response = of(Result.success([]))
    const read = vi.spyOn(source, "getActiveServiceTypes").mockReturnValue(response)
    expect(TestBed.inject(ListActiveServiceTypesUseCase).execute()).toBe(response)
    expect(read).toHaveBeenCalledExactlyOnceWith()
    expect(TestBed.inject(ServiceCatalogHttpSource)).toBe(source)
  })
  it("propagates exact failure Result without translating or swallowing it", async () => {
    const failure = Result.failure(new ServiceCatalogError("FORBIDDEN", "Seguro"))
    vi.spyOn(TestBed.inject(ServiceCatalogHttpSource), "getActiveServiceTypes").mockReturnValue(
      of(failure)
    )
    expect(await firstValueFrom(TestBed.inject(ListActiveServiceTypesUseCase).execute())).toBe(
      failure
    )
  })
  it("returns UNSUPPORTED for every proposed method with zero HTTP", async () => {
    const r = TestBed.inject(SERVICE_CATALOG_REPOSITORY)
    const category = { name: "Fixture", description: null, isActive: true }
    const type = { ...category, categoryId: 1, estimatedDurationMinutes: 60 }
    const frequency = { name: "Fixture", intervalDays: 7, isActive: true }
    const rate = {
      serviceTypeId: 1,
      frequencyId: null,
      price: "10.00",
      currency: "USD",
      validFrom: "2026-01-01",
      validUntil: null,
      isActive: true
    }
    const additional = { ...category, price: "10.00", extraDurationMinutes: null }
    const task = { description: "Fixture", sortOrder: 0, isRequired: true }
    const results: Observable<Result<unknown, ServiceCatalogError>>[] = [
      r.getCategories(),
      r.createCategory(category),
      r.updateCategory(1, category),
      r.getServiceTypes(1),
      r.createServiceType(type),
      r.updateServiceType(1, type),
      r.getFrequencies(),
      r.createFrequency(frequency),
      r.updateFrequency(1, frequency),
      r.getRates(1),
      r.createRate(rate),
      r.updateRate(1, rate),
      r.getAdditionalServices(),
      r.createAdditionalService(additional),
      r.updateAdditionalService(1, additional),
      r.getTasks(1),
      r.createTask(1, task),
      r.updateTask(1, 2, task)
    ]
    for (const result of results)
      expect(await firstValueFrom(result)).toMatchObject({
        success: false,
        error: { code: "UNSUPPORTED" }
      })
    TestBed.inject(HttpTestingController).expectNone(() => true)
    TestBed.inject(HttpTestingController).verify()
  })
})
