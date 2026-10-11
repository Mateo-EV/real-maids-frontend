import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { RoleRepositoryImpl } from "../repositories/role.repository-impl"
const endpoint = "http://localhost:8080/api/roles"
const dto = {
  idRol: 19,
  nombre: "Returned Role",
  descripcion: "",
  activo: true,
  fechaCreacion: "2026-01-01T00:00:00Z",
  delSistema: true,
  permisos: []
}
describe("real role catalog", () => {
  let repository: RoleRepositoryImpl, http: HttpTestingController
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" }
      ]
    })
    repository = TestBed.inject(RoleRepositoryImpl)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())
  it("maps stable returned catalog metadata, not demo IDs or permissions", async () => {
    const pending = firstValueFrom(repository.getRoles())
    const request = http.expectOne(endpoint)
    expect(request.request.transferCache).toBe(false)
    request.flush([dto])
    expect(await pending).toMatchObject({
      success: true,
      data: [
        {
          id: 19,
          name: dto.nombre,
          description: "",
          isActive: true,
          createdAt: new Date(dto.fechaCreacion)
        }
      ]
    })
  })
  it("maps detail through the documented ID endpoint", async () => {
    const pending = firstValueFrom(repository.getRoleById(19))
    http.expectOne(`${endpoint}/19`).flush(dto)
    expect(await pending).toMatchObject({ success: true, data: { id: 19 } })
  })
  it("rejects a role identity that differs from the requested ID", async () => {
    const pending = firstValueFrom(repository.getRoleById(19))
    http.expectOne(`${endpoint}/19`).flush({ ...dto, idRol: 20 })
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })
  it.each([
    null,
    {},
    [dto, dto],
    [{ ...dto, idRol: "19" }],
    [{ ...dto, descripcion: null }],
    [{ ...dto, nombre: " " }],
    [{ ...dto, activo: undefined }],
    [{ ...dto, fechaCreacion: "bad" }]
  ])("rejects malformed catalog %j", async payload => {
    const pending = firstValueFrom(repository.getRoles())
    http.expectOne(endpoint).flush(payload)
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })
  it.each([
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "ROLE_NOT_FOUND"],
    [500, "UNEXPECTED"]
  ])("maps error %s safely", async (status, code) => {
    const pending = firstValueFrom(repository.getRoles())
    http
      .expectOne(endpoint)
      .flush({ sensitive: "not exposed" }, { status: Number(status), statusText: "Failure" })
    expect(await pending).toMatchObject({ success: false, error: { code } })
  })
  it("has no administrative mutation demo fallback or invented DELETE endpoint", async () => {
    expect(
      await firstValueFrom(repository.createRole({ name: "Fake", description: "", isActive: true }))
    ).toMatchObject({ success: false, error: { code: "UNSUPPORTED" } })
    expect(
      await firstValueFrom(
        repository.updateRoleById(19, { name: "Fake", description: "", isActive: false })
      )
    ).toMatchObject({ success: false, error: { code: "UNSUPPORTED" } })
    expect(await firstValueFrom(repository.deleteRoleById(19))).toMatchObject({
      success: false,
      error: { code: "UNSUPPORTED" }
    })
    http.expectNone(() => true)
  })
  it("does not request protected catalog during SSR", async () => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" },
        { provide: PLATFORM_ID, useValue: "server" }
      ]
    })
    expect((await firstValueFrom(TestBed.inject(RoleRepositoryImpl).getRoles())).success).toBe(
      false
    )
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
