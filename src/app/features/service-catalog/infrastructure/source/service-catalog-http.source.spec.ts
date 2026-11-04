import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { PLATFORM_ID } from "@angular/core"
import { firstValueFrom } from "rxjs"
import { ServiceCatalogErrorCode } from "../../domain/errors/service-catalog.error"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ServiceCatalogHttpSource } from "./service-catalog-http.source"

const url = "https://api.example.test/api/catalogos/tipos-servicio"
const dto = {
  idTipoServicio: 9,
  nombre: "Limpieza",
  descripcion: null,
  duracionEstimadaMinutos: 60,
  idCategoria: 3,
  categoria: "Hogar"
}
describe("ServiceCatalogHttpSource", () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "https://api.example.test" }
      ]
    })
  )
  afterEach(() => TestBed.inject(HttpTestingController).verify())
  it("requests the unpaged active catalog without query parameters or transfer cache", () => {
    TestBed.inject(ServiceCatalogHttpSource).getActiveServiceTypes().subscribe()
    const request = TestBed.inject(HttpTestingController).expectOne(url)
    expect(request.request.method).toBe("GET")
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.transferCache).toBe(false)
    request.flush([dto])
  })
  it("maps null/empty descriptions and preserves category/name server order without invented fields", async () => {
    const result = firstValueFrom(TestBed.inject(ServiceCatalogHttpSource).getActiveServiceTypes())
    TestBed.inject(HttpTestingController)
      .expectOne(url)
      .flush([
        dto,
        {
          ...dto,
          idTipoServicio: 2,
          nombre: "Otro",
          descripcion: "",
          idCategoria: 1,
          categoria: "A"
        }
      ])
    expect(await result).toMatchObject({
      success: true,
      data: [
        {
          id: 9,
          name: "Limpieza",
          description: null,
          estimatedDurationMinutes: 60,
          categoryId: 3,
          categoryName: "Hogar"
        },
        {
          id: 2,
          name: "Otro",
          description: "",
          estimatedDurationMinutes: 60,
          categoryId: 1,
          categoryName: "A"
        }
      ]
    })
    const value = await result
    if (value.success) expect(Object.keys(value.data[0])).toHaveLength(6)
  })
  it("accepts a verified empty array", async () => {
    const result = firstValueFrom(TestBed.inject(ServiceCatalogHttpSource).getActiveServiceTypes())
    TestBed.inject(HttpTestingController).expectOne(url).flush([])
    expect(await result).toMatchObject({ success: true, data: [] })
  })
  it.each(
    [
      null,
      {},
      { contenido: [] },
      [null],
      [[]],
      [dto, dto],
      ...[0, -1, 1.5, 2147483648, "9", null].map(idTipoServicio => [{ ...dto, idTipoServicio }]),
      ...[0, 1.5, 2147483648, null].map(idCategoria => [{ ...dto, idCategoria }]),
      ...[null, "", "  ", 8].map(nombre => [{ ...dto, nombre }]),
      ...[null, "", false].map(categoria => [{ ...dto, categoria }]),
      ...[undefined, 3, false].map(descripcion => [{ ...dto, descripcion }]),
      ...[null, "60", 0.5, 2147483648].map(duracionEstimadaMinutos => [
        { ...dto, duracionEstimadaMinutos }
      ])
    ].map(payload => ({ payload }))
  )("rejects malformed DTO %# as a whole Result", async ({ payload }) => {
    const result = firstValueFrom(TestBed.inject(ServiceCatalogHttpSource).getActiveServiceTypes())
    TestBed.inject(HttpTestingController).expectOne(url).flush(payload)
    expect(await result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })
  it.each<[number, ServiceCatalogErrorCode]>([
    [400, "INVALID_DATA"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [405, "UNSUPPORTED"],
    [409, "CONFLICT"],
    [500, "UNAVAILABLE"],
    [503, "UNAVAILABLE"]
  ])("maps HTTP %s safely without retry", async (status, code) => {
    const result = firstValueFrom(TestBed.inject(ServiceCatalogHttpSource).getActiveServiceTypes())
    TestBed.inject(HttpTestingController)
      .expectOne(url)
      .flush({ mensaje: "PRIVATE BACKEND DETAIL" }, { status, statusText: "Failure" })
    const value = await result
    expect(value).toMatchObject({ success: false, error: { code } })
    if (!value.success) expect(value.error.message).not.toContain("PRIVATE")
  })
  it("maps network failure without retry", async () => {
    const result = firstValueFrom(TestBed.inject(ServiceCatalogHttpSource).getActiveServiceTypes())
    TestBed.inject(HttpTestingController).expectOne(url).error(new ProgressEvent("error"))
    expect(await result).toMatchObject({ success: false, error: { code: "UNAVAILABLE" } })
  })
  it.each([
    null,
    "",
    "invalid",
    "/api",
    "https://user:pass@api.example.test",
    "https://api.example.test/path",
    "https://api.example.test?x=1",
    "https://api.example.test#x",
    "http://api.example.test"
  ])("fails closed for an unusable API origin %#", async origin => {
    TestBed.overrideProvider(API_URL, { useValue: origin })
    expect(
      await firstValueFrom(TestBed.inject(ServiceCatalogHttpSource).getActiveServiceTypes())
    ).toMatchObject({ success: false, error: { code: "UNCONFIGURED" } })
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
  it("dispatches no HTTP in SSR", async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    expect(
      await firstValueFrom(TestBed.inject(ServiceCatalogHttpSource).getActiveServiceTypes())
    ).toMatchObject({ success: false, error: { code: "UNCONFIGURED" } })
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
