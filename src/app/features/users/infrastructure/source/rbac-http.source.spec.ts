import { PLATFORM_ID } from "@angular/core"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { RbacRepositoryImpl } from "../repositories/rbac.repository-impl"
const permission = {
  idPermiso: 0,
  codigo: "CUSTOM_ACTION",
  modulo: "Backend module",
  descripcion: "Custom description"
}
function setup(platform = "browser") {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: platform },
      { provide: API_URL, useValue: "http://localhost:8080" }
    ]
  })
  return { source: TestBed.inject(RbacRepositoryImpl), http: TestBed.inject(HttpTestingController) }
}
describe("real RBAC transport", () => {
  it("loads dynamic catalog and assignments without demo inference", async () => {
    const { source, http } = setup()
    const catalog = firstValueFrom(source.getPermissions())
    http.expectOne("http://localhost:8080/api/permisos").flush([permission])
    expect(await catalog).toMatchObject({
      success: true,
      data: [{ id: 0, code: "CUSTOM_ACTION", module: "Backend module" }]
    })
    const pending = firstValueFrom(source.getRolePermissions(19))
    http.expectOne("http://localhost:8080/api/roles/19/permisos").flush([])
    expect(await pending).toMatchObject({ success: true, data: { roleId: 19, permissions: [] } })
    http.verify()
  })
  it.each([{ ids: [0] }, { ids: [] }])(
    "atomically replaces all IDs including empty %j",
    async ({ ids }) => {
      const { source, http } = setup()
      const pending = firstValueFrom(source.saveRolePermissions(19, ids))
      const request = http.expectOne("http://localhost:8080/api/roles/19/permisos")
      expect(request.request.method).toBe("PUT")
      expect(request.request.body).toEqual({ idsPermisos: ids })
      request.flush({ idRol: 19, permisos: ids.length ? [permission] : [] })
      expect(await pending).toMatchObject({ success: true, data: { roleId: 19 } })
    }
  )
  it.each([[0, 0], [-1], [1.5], [2147483648]].map(ids => ({ ids })))(
    "rejects invalid or duplicate IDs %j without HTTP",
    async ({ ids }) => {
      const { source, http } = setup()
      expect(await firstValueFrom(source.saveRolePermissions(19, ids))).toMatchObject({
        success: false,
        error: { code: "INVALID_GRANTS" }
      })
      http.expectNone("http://localhost:8080/api/roles/19/permisos")
    }
  )
  it.each(
    [
      [permission, permission],
      [permission, { ...permission, idPermiso: 1 }],
      [{ ...permission, modulo: null }],
      [{ ...permission, idPermiso: -1 }]
    ].map(body => ({ body }))
  )("rejects malformed or duplicate catalog %j", async ({ body }) => {
    const { source, http } = setup()
    const pending = firstValueFrom(source.getPermissions())
    http.expectOne("http://localhost:8080/api/permisos").flush(body)
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })
  it.each([
    { idRol: 20, permisos: [permission] },
    { idRol: 19, permisos: [] }
  ])("rejects inconsistent replacement response %j", async body => {
    const { source, http } = setup()
    const pending = firstValueFrom(source.saveRolePermissions(19, [0]))
    http.expectOne("http://localhost:8080/api/roles/19/permisos").flush(body)
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })
  it("reports backend 403 without replay", async () => {
    const { source, http } = setup()
    const pending = firstValueFrom(source.saveRolePermissions(19, []))
    http
      .expectOne("http://localhost:8080/api/roles/19/permisos")
      .flush({}, { status: 403, statusText: "Forbidden" })
    expect(await pending).toMatchObject({ success: false, error: { code: "FORBIDDEN" } })
    http.verify()
  })
  it("cancels an in-flight assignment read when unsubscribed", () => {
    const { source, http } = setup()
    const subscription = source.getRolePermissions(19).subscribe()
    const request = http.expectOne("http://localhost:8080/api/roles/19/permisos")
    subscription.unsubscribe()
    expect(request.cancelled).toBe(true)
    http.verify()
  })
  it("does not dispatch HTTP during SSR", async () => {
    const { source, http } = setup("server")
    expect(await firstValueFrom(source.getPermissions())).toMatchObject({
      success: false,
      error: { code: "UNCONFIGURED" }
    })
    http.verify()
  })
})
