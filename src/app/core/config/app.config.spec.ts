import { TestBed } from "@angular/core/testing"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { API_URL } from "../tokens/api-url.token"
import { environment } from "@/environments/environment"
import { environment as production } from "@/environments/environment.production"
import { ToastConfig } from "@ngxpert/hot-toast"
import { Router } from "@angular/router"
import { firstValueFrom, Observable } from "rxjs"
import { AuthRepositoryImpl } from "@/app/features/auth/infrastructure/repositories/auth.repository-impl"
import { CustomerRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/customer.repository-impl"
import { UserRepositoryImpl } from "@/app/features/users/infrastructure/repositories/user.repository-impl"
import { RoleRepositoryImpl } from "@/app/features/users/infrastructure/repositories/role.repository-impl"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appConfig } from "./app.config"
import { AUTH_REPOSITORY } from "@/app/features/auth/domain/repositories/auth.repository"
import { AuthHttpSource } from "@/app/features/auth/infrastructure/source/auth-http.source"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { CUSTOMER_REPOSITORY } from "@/app/features/customers/domain/repositories/customer.repository"
import { CustomerInMemorySource } from "@/app/features/customers/infrastructure/source/customer-in-memory.source"
import { CustomersStore } from "@/app/features/customers/presentation/state/customers.store"
import { AdminShell } from "@/app/experiences/admin/presentation/components/admin-shell/admin-shell"

import { USER_REPOSITORY } from "@/app/features/users/domain/repositories/user.repository"
import { UserInMemorySource } from "@/app/features/users/infrastructure/source/user-in-memory.source"
import { UserHttpSource } from "@/app/features/users/infrastructure/source/user-http.source"
import { CreateUserUseCase } from "@/app/features/users/application/use-cases/create-user.use-case"
import { GetUserByIdUseCase } from "@/app/features/users/application/use-cases/get-user-by-id.use-case"
import { Lang } from "@/app/features/users/domain/entities/user.entity"
import { ROLE_REPOSITORY } from "@/app/features/users/domain/repositories/role.repository"
import { RoleInMemorySource } from "@/app/features/users/infrastructure/source/role-in-memory.source"
import { RolesStore } from "@/app/features/users/presentation/state/roles.store"
import { UserStore } from "@/app/features/users/presentation/state/user.store"
import { GetRoleByIdUseCase } from "@/app/features/users/application/use-cases/get-role-by-id.use-case"

import { AUDIT_LOG_REPOSITORY } from "@/app/features/users/domain/repositories/audit-log.repository"
import { AuditLogRepositoryImpl } from "@/app/features/users/infrastructure/repositories/audit-log.repository-impl"
import { AuditLogInMemorySource } from "@/app/features/users/infrastructure/source/audit-log-in-memory.source"
import { GetAuditLogsUseCase } from "@/app/features/users/application/use-cases/get-audit-logs.use-case"
import { UserSessionHttpSource } from "@/app/features/users/infrastructure/source/user-session-http.source"
import { USER_SESSION_REPOSITORY } from "@/app/features/users/domain/repositories/user-session.repository"
import { UserSessionRepositoryImpl } from "@/app/features/users/infrastructure/repositories/user-session.repository-impl"
import { UserSessionInMemorySource } from "@/app/features/users/infrastructure/source/user-session-in-memory.source"
import { GetUserSessionsUseCase } from "@/app/features/users/application/use-cases/get-user-sessions.use-case"

async function settle<T>(stream: Observable<T>): Promise<T> {
  const pending = firstValueFrom(stream)
  await vi.runAllTimersAsync()
  return pending
}

describe("Application repository composition", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()]
    })
    vi.useFakeTimers()
  })

  afterEach(() => vi.useRealTimers())

  it("leaves toast configuration to the lazy Users route", () => {
    expect(TestBed.inject(ToastConfig, null)).toBeNull()
  })

  it("aliases the distinct audit token to the root implementation and connects its query", async () => {
    const repository = TestBed.inject(AUDIT_LOG_REPOSITORY)
    expect(AUDIT_LOG_REPOSITORY).not.toBe(USER_REPOSITORY)
    expect(repository).toBe(TestBed.inject(AuditLogRepositoryImpl))
    expect(repository).not.toBe(TestBed.inject(AuditLogInMemorySource))
    await establishHttpAuth()
    const http = TestBed.inject(HttpTestingController)
    const pending = firstValueFrom(
      TestBed.inject(GetAuditLogsUseCase).execute({ page: 0, size: 1 })
    )
    const request = http.expectOne(r => r.url === "http://localhost:8080/api/auditoria")
    expect(request.request.headers.get("Authorization")).toBe("Bearer fake-access")
    request.flush({
      contenido: [],
      pagina: 0,
      tamanio: 1,
      totalElementos: 0,
      totalPaginas: 0,
      totalGlobal: 90
    })
    expect(await pending).toMatchObject({
      success: true,
      data: { items: [], total: 0, globalTotal: 90 }
    })
    http.verify()
  })

  it("aliases sessions to the root HTTP implementation without a demo fallback", async () => {
    await establishHttpAuth()
    const repository = TestBed.inject(USER_SESSION_REPOSITORY)
    expect(repository).toBe(TestBed.inject(UserSessionRepositoryImpl))
    expect(repository).not.toBe(TestBed.inject(UserSessionHttpSource))
    expect(repository).not.toBe(TestBed.inject(UserSessionInMemorySource))
    const pending = firstValueFrom(
      TestBed.inject(GetUserSessionsUseCase).execute({ page: 0, size: 20 })
    )
    const http = TestBed.inject(HttpTestingController)
    const request = http.expectOne(r => r.url === "http://localhost:8080/api/sesiones")
    expect(request.request.headers.get("Authorization")).toBe("Bearer fake-access")
    request.flush({ contenido: [], pagina: 0, tamanio: 20, totalElementos: 0, totalPaginas: 0 })
    expect(await pending).toMatchObject({ success: true, data: { items: [], total: 0 } })
    http.verify()
  })

  it("aliases the auth token to the root implementation instance", () => {
    expect(TestBed.inject(AUTH_REPOSITORY)).toBe(TestBed.inject(AuthRepositoryImpl))
    expect(TestBed.inject(AUTH_REPOSITORY)).not.toBe(TestBed.inject(AuthHttpSource))
  })

  it("aliases the customer token to the root implementation instance", () => {
    expect(TestBed.inject(CUSTOMER_REPOSITORY)).toBe(TestBed.inject(CustomerRepositoryImpl))
    expect(TestBed.inject(CUSTOMER_REPOSITORY)).not.toBe(TestBed.inject(CustomerInMemorySource))
  })

  it("aliases the user token to the root implementation instance", () => {
    expect(TestBed.inject(USER_REPOSITORY)).toBe(TestBed.inject(UserRepositoryImpl))
    expect(TestBed.inject(USER_REPOSITORY)).not.toBe(TestBed.inject(UserInMemorySource))
  })

  async function establishHttpAuth() {
    const pending = firstValueFrom(
      TestBed.inject(AuthStore).login({ email: "fake@example.test", password: "FakePassword1" })
    )
    TestBed.inject(HttpTestingController)
      .expectOne("http://localhost:8080/api/auth/login")
      .flush({
        token: "fake-access",
        tipo: "Bearer",
        expiraEnSegundos: 60,
        refreshToken: "fake-refresh",
        refreshExpiraEnSegundos: 600,
        usuario: {
          idUsuario: 7,
          nombre: "Fake",
          correo: "fake@example.test",
          idRol: 9,
          rol: "Backend role",
          idioma: "es",
          permisos: []
        }
      })
    expect((await pending).success).toBe(true)
  }

  it("connects the real role catalog while retaining root store lifetimes and no management fallback", async () => {
    await establishHttpAuth()
    const http = TestBed.inject(HttpTestingController)
    expect(TestBed.inject(ROLE_REPOSITORY)).toBe(TestBed.inject(RoleRepositoryImpl))
    expect(TestBed.inject(ROLE_REPOSITORY)).not.toBe(TestBed.inject(RoleInMemorySource))
    const roles = TestBed.inject(RolesStore)
    const dto = {
      idRol: 9,
      nombre: "Backend role",
      descripcion: "Returned",
      activo: true,
      fechaCreacion: "2026-01-01T00:00:00Z"
    }
    const loaded = firstValueFrom(roles.loadRoles())
    const request = http.expectOne("http://localhost:8080/api/roles")
    expect(request.request.headers.get("Authorization")).toBe("Bearer fake-access")
    request.flush([dto])
    const result = await loaded
    expect(result.success).toBe(true)
    const found = firstValueFrom(TestBed.inject(GetRoleByIdUseCase).execute(9))
    http.expectOne("http://localhost:8080/api/roles/9").flush(dto)
    expect(await found).toMatchObject({ success: true, data: { id: 9, name: "Backend role" } })
    expect(roles.roles()).toHaveLength(1)
    expect(TestBed.inject(RolesStore)).toBe(roles)
    expect(TestBed.inject(UserStore)).toBe(TestBed.inject(UserStore))
    expect(
      await firstValueFrom(roles.createRole({ name: "Unexposed", description: "", isActive: true }))
    ).toMatchObject({ success: false, error: { code: "UNSUPPORTED" } })
    http.verify()
  })

  it("connects user use cases to HTTP without a demo fallback or credential echo", async () => {
    await establishHttpAuth()
    const http = TestBed.inject(HttpTestingController)
    const dto = {
      idUsuario: 41,
      nombre: "Fake User",
      correo: "fake-user@example.test",
      idRol: 9,
      rol: "Backend role",
      idioma: "en",
      activo: true,
      ultimoAcceso: null,
      fechaCreacion: "2026-01-01T00:00:00Z",
      fechaActualizacion: "2026-01-01T00:00:00Z"
    }
    const created = firstValueFrom(
      TestBed.inject(CreateUserUseCase).execute({
        name: dto.nombre,
        email: dto.correo,
        password: "FakePassword1",
        lang: Lang.EN,
        isActive: true,
        roleId: 9
      })
    )
    const request = http.expectOne("http://localhost:8080/api/usuarios")
    expect(request.request.method).toBe("POST")
    expect(request.request.body).not.toHaveProperty("age")
    expect(request.request.headers.get("Authorization")).toBe("Bearer fake-access")
    request.flush(dto)
    const result = await created
    expect(result).toMatchObject({ success: true, data: { id: 41, name: dto.nombre } })
    const found = firstValueFrom(TestBed.inject(GetUserByIdUseCase).execute(41))
    http.expectOne("http://localhost:8080/api/usuarios/41").flush(dto)
    expect(await found).toEqual(result)
    const source = firstValueFrom(TestBed.inject(UserHttpSource).getUserById(41))
    http.expectOne("http://localhost:8080/api/usuarios/41").flush(dto)
    expect(await source).toEqual(result)
    expect(TestBed.inject(CreateUserUseCase)).toBe(TestBed.inject(CreateUserUseCase))
    http.verify()
  })

  it("connects root HTTP auth state, its source and admin logout", async () => {
    const store = TestBed.inject(AuthStore)
    const source = TestBed.inject(AuthHttpSource)
    expect(TestBed.inject(API_URL)).toBe(environment.apiUrl)
    expect(production.apiUrl).toBeNull()
    const login = firstValueFrom(
      store.login({ email: "fake@example.test", password: "FakePassword1" })
    )
    const http = TestBed.inject(HttpTestingController)
    http.expectOne("http://localhost:8080/api/auth/login").flush({
      token: "fake-token",
      tipo: "Bearer",
      expiraEnSegundos: 60,
      refreshToken: "fake-refresh",
      refreshExpiraEnSegundos: 600,
      usuario: {
        idUsuario: 7,
        nombre: "Fake Name",
        correo: "returned@example.test",
        idRol: 3,
        rol: "Operaciones",
        idioma: "es",
        permisos: []
      }
    })
    expect((await login).success).toBe(true)
    expect(store.isAuthenticated()).toBe(true)
    expect(store.session()?.name).toBe("Fake Name")
    expect(store.session()?.email).toBe("returned@example.test")
    expect((await firstValueFrom(source.me())).success).toBe(true)
    http.verify()

    const navigate = vi.spyOn(TestBed.inject(Router), "navigateByUrl").mockResolvedValue(true)
    const page = TestBed.runInInjectionContext(() => new AdminShell())
    page.logout()
    http
      .expectOne("http://localhost:8080/api/auth/logout")
      .flush(null, { status: 204, statusText: "OK" })

    expect(store.isAuthenticated()).toBe(false)
    expect(page.session()).toBeNull()
    expect(navigate).toHaveBeenCalledWith("/login")
    const loggedOut = firstValueFrom(source.me())
    await vi.runAllTimersAsync()
    expect((await loggedOut).success).toBe(false)
    expect(TestBed.inject(AuthStore)).toBe(store)
  })

  it("shares customer mutations between the root store and source", async () => {
    const store = TestBed.inject(CustomersStore)
    const created = firstValueFrom(
      store.createCustomer({
        name: "Demo customer",
        email: "demo@example.com",
        phone: "+1 555 010 1003"
      })
    )
    await vi.runAllTimersAsync()
    const result = await created
    expect(result.success).toBe(true)
    if (!result.success) throw new Error("Expected successful customer creation")

    const found = firstValueFrom(TestBed.inject(CustomerInMemorySource).findById(result.data.id))
    await vi.runAllTimersAsync()
    const sourceResult = await found
    expect(sourceResult.success).toBe(true)
    if (!sourceResult.success) throw new Error("Expected customer in root source")
    expect(sourceResult.data).toEqual(result.data)
    expect(TestBed.inject(CustomersStore)).toBe(store)
  })
})
