import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  getDebugNode,
  PLATFORM_ID
} from "@angular/core"
import { DOCUMENT } from "@angular/common"
import { TestBed } from "@angular/core/testing"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { RouterTestingHarness } from "@angular/router/testing"
import { firstValueFrom } from "rxjs"
import { HotToastService, ToastConfig } from "@ngxpert/hot-toast"
import { ViewService } from "@ngneat/overview"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { appConfig } from "@/app/core/config/app.config"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { USERS_ROUTES } from "./users.routes"
import { UsersPage } from "./presentation/pages/users-page/users-page"
import { UserEditorContext } from "./presentation/components/user-editor/user-editor"

// Containers attach outside the routed fixture; dispose their real Angular views as well.
afterEach(() => {
  document.querySelectorAll("hot-toast-container").forEach(element => {
    const service = getDebugNode(element)?.injector.get(HotToastService)
    service?.close()
    const ref = (service as unknown as { _componentRef?: { destroy(): void } })?._componentRef
    ref?.destroy()
    element.remove()
  })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("USERS_ROUTES", () => {
  // jsdom has no layout observer; injector/notification assertions do not require geometry.
  beforeEach(() =>
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    )
  )
  it("lazy loads the standalone IAM page behind the existing auth guard", async () => {
    const route = USERS_ROUTES[0]
    expect(route.path).toBe("")
    expect(route.canActivate).toEqual([authGuard])
    expect(route.title).toBe("Usuarios | The Real Maids")
    expect(await route.loadComponent!()).toBe(UsersPage)
  })

  it("owns service, config and the body-container view injector without changing root state", () => {
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const root = TestBed.inject(EnvironmentInjector)
    const route = createEnvironmentInjector(USERS_ROUTES[0].providers ?? [], root)
    try {
      expect(route.get(HotToastService, null, { self: true })).not.toBeNull()
      expect(route.get(ToastConfig, null, { self: true })).toBeUndefined()
      expect(route.get(ViewService, null, { self: true })).not.toBeNull()
      expect(route.get(AuthStore)).toBe(root.get(AuthStore))
    } finally {
      route.destroy()
    }
  })

  it("uses the same real configured service for dialog callbacks, inline consumers and reentry", async () => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()]
    })
    const http = TestBed.inject(HttpTestingController)
    const auth = TestBed.inject(AuthStore)
    const establishSession = async () => {
      const pending = firstValueFrom(
        auth.login({ email: "fake@example.test", password: "FakePassword1" })
      )
      const request = http.expectOne("http://localhost:8080/api/auth/login")
      expect(request.request.method).toBe("POST")
      expect(request.request.body).toEqual({
        correo: "fake@example.test",
        password: "FakePassword1"
      })
      expect(request.request.headers.has("Authorization")).toBe(false)
      request.flush({
        token: "fake-token",
        tipo: "Bearer",
        expiraEnSegundos: 3600,
        refreshToken: "fake-refresh",
        refreshExpiraEnSegundos: 7200,
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
      expect((await pending).success).toBe(true)
      expect(auth.session()).toMatchObject({
        name: "Fake Name",
        email: "returned@example.test",
        role: "Operaciones"
      })
      http.verify()
    }
    function flushHttpCatalog(includeRoles: boolean) {
      const statistics = http.expectOne("http://localhost:8080/api/usuarios/estadisticas")
      expect(statistics.request.headers.get("Authorization")).toBe("Bearer fake-token")
      statistics.flush({ total: 1, activos: 1, inactivos: 0 })
      const sessions = http.expectOne(
        request => request.url === "http://localhost:8080/api/sesiones"
      )
      expect(sessions.request.headers.get("Authorization")).toBe("Bearer fake-token")
      expect(sessions.request.params.get("pagina")).toBe("0")
      expect(sessions.request.params.get("tamanio")).toBe("1")
      sessions.flush({
        contenido: [],
        pagina: 0,
        tamanio: 1,
        totalElementos: 0,
        totalPaginas: 0
      })
      const audit = http.expectOne(request => request.url === "http://localhost:8080/api/auditoria")
      expect(audit.request.headers.get("Authorization")).toBe("Bearer fake-token")
      expect(audit.request.params.get("tamanio")).toBe("1")
      audit.flush({
        contenido: [],
        pagina: 0,
        tamanio: 1,
        totalElementos: 0,
        totalPaginas: 0,
        totalGlobal: 0
      })
      if (includeRoles)
        http.expectOne("http://localhost:8080/api/roles").flush([
          {
            idRol: 3,
            nombre: "Operaciones",
            descripcion: "Fake role",
            activo: true,
            fechaCreacion: "2026-01-01T00:00:00Z"
          }
        ])
      http.expectNone(
        request =>
          request.params.get("tamanio") === "500" || request.params.get("tamanio") === "1000"
      )
      const listing = http.expectOne(
        request =>
          request.url === "http://localhost:8080/api/usuarios" &&
          request.params.get("tamanio") === "10"
      )
      expect(listing.request.params.get("pagina")).toBe("0")
      expect(listing.request.headers.get("Authorization")).toBe("Bearer fake-token")
      const userResponse = {
        contenido: [
          {
            idUsuario: 7,
            nombre: "Fake Name",
            correo: "returned@example.test",
            idRol: 3,
            rol: "Operaciones",
            idioma: "es",
            activo: true,
            ultimoAcceso: null,
            fechaCreacion: "2026-01-01T00:00:00Z",
            fechaActualizacion: "2026-01-01T00:00:00Z"
          }
        ],
        pagina: 0,
        tamanio: 500,
        totalElementos: 1,
        totalPaginas: 1
      }
      listing.flush({ ...userResponse, tamanio: 10 })
    }
    await establishSession()
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl("/admin/users")
    harness.detectChanges()
    flushHttpCatalog(true)
    const pageElement = harness.routeDebugElement!.query(
      debug => debug.componentInstance instanceof UsersPage
    )
    const page = pageElement.componentInstance as UsersPage
    const toast = pageElement.injector.get(HotToastService)
    expect(toast).not.toBe(TestBed.inject(HotToastService))
    expect(pageElement.injector.get(ToastConfig)).toBeUndefined()
    expect(toast.defaultConfig.position).toBe("top-center")

    const success = vi.spyOn(toast, "success")
    const open = vi.spyOn(pageElement.injector.get(HlmDialogService), "open")
    page.editUser()
    const context = open.mock.calls[0][1]!.context as UserEditorContext
    context.onSaved()
    expect(success).toHaveBeenCalledWith("Usuario guardado")
    const container = document.body.querySelector("hot-toast-container")!
    expect(container).not.toBeNull()
    expect(getDebugNode(container)!.injector.get(HotToastService)).toBe(toast)
    expect(container.parentElement).toBe(document.body)
    expect(
      (getDebugNode(container)!.componentInstance as { defaultConfig(): unknown }).defaultConfig()
    ).toBe(toast.defaultConfig)
    TestBed.tick()
    expect(document.querySelector("app-user-editor")).not.toBeNull()
    open.mock.results[0].value.close()

    // Visit an inline consumer through the actual template after catalog initialization.
    await vi.waitFor(() => expect(page.initializing()).toBe(false))
    expect(page.loadError()).toBe(false)
    page.section.set("sessions")
    harness.detectChanges()
    const sessions = pageElement.query(debug => debug.name === "app-user-sessions")
    expect(sessions).not.toBeNull()
    expect(sessions.injector.get(HotToastService)).toBe(toast)
    http
      .expectOne("http://localhost:8080/api/sesiones/usuarios?pagina=0&tamanio=5")
      .flush({ contenido: [], pagina: 0, tamanio: 5, totalElementos: 0, totalPaginas: 0 })

    auth.logout()
    expect(auth.session()).toBeNull()
    expect(auth.isAuthenticated()).toBe(false)
    http
      .expectOne("http://localhost:8080/api/auth/logout")
      .flush(null, { status: 204, statusText: "OK" })
    http.expectNone(() => true)
    await harness.navigateByUrl("/login")
    await establishSession()
    await harness.navigateByUrl("/admin/users")
    harness.detectChanges()
    flushHttpCatalog(true) // Session replacement clears the sensitive role catalog too.
    const revisited = harness.routeDebugElement!.query(
      debug => debug.componentInstance instanceof UsersPage
    )
    expect(revisited.injector.get(HotToastService)).toBe(toast)
    expect(revisited.injector.get(HotToastService).defaultConfig.position).toBe("top-center")
    toast.success("Notificación al volver")
    expect(document.querySelectorAll("hot-toast-container")).toHaveLength(1)
    expect(document.querySelector("hot-toast-container")).toBe(container)
    http.verify()
  })

  it("creates and initializes the route service on the server without reading document.body", () => {
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const body = vi.fn(() => {
      throw new Error("Browser body accessed during SSR")
    })
    const serverDocument = Object.defineProperty({}, "body", { get: body })
    const route = createEnvironmentInjector(
      [
        ...(USERS_ROUTES[0].providers ?? []),
        { provide: PLATFORM_ID, useValue: "server" },
        { provide: DOCUMENT, useValue: serverDocument }
      ],
      TestBed.inject(EnvironmentInjector)
    )
    try {
      const toast = route.get(HotToastService)
      // Exercise the package's SSR guard without claiming success() is server-safe.
      expect(() => (toast as unknown as { init(): void }).init()).not.toThrow()
      expect(body).not.toHaveBeenCalled()
    } finally {
      route.destroy()
    }
  })
})
