import { AUTH_REPOSITORY } from "@/app/features/auth/domain/repositories/auth.repository"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { Result } from "@/app/shared/utils/result"
import { TestBed } from "@angular/core/testing"
import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth.repository-impl"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { API_URL } from "@/app/core/tokens/api-url.token"
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree
} from "@angular/router"
import { EMPTY, firstValueFrom, isObservable, Observable, of, Subject, throwError } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authGuard, guestGuard, portalGuard, staffGuard } from "./auth.guard"

describe("auth guards", () => {
  const authPersistenceKeyPrefix = "real-maids.auth.v1:"
  const session = AuthSession.create("Demo", "demo@example.com")
  /** WP11 S3: the field staff label the backend returns in `PerfilResponse.rol`. */
  const fieldStaffSession = () =>
    AuthSession.create(
      "Personal Campo",
      "campo@example.test",
      "PERSONAL_CAMPO",
      null,
      11,
      3,
      "es",
      []
    )
  const customerSession = () =>
    AuthSession.create("Cliente", "cliente@example.test", "CLIENTE", null, 12, 4, "es", [])
  let currentUser: Subject<Result<AuthSession, AuthError>>
  const me = vi.fn()

  function clearAuthPersistence() {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    for (const key of keys) {
      if (key?.startsWith(authPersistenceKeyPrefix)) localStorage.removeItem(key)
    }
  }

  beforeEach(() => {
    clearAuthPersistence()
    currentUser = new Subject()
    me.mockReset().mockReturnValue(currentUser)
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AUTH_REPOSITORY,
          useValue: {
            me,
            login: vi.fn(),
            logout: vi.fn(),
            invalidate: vi.fn(),
            sessionChanges: () => EMPTY
          }
        }
      ]
    })
  })

  afterEach(() => {
    clearAuthPersistence()
  })

  function check(guard: typeof authGuard, url = "/admin/orders?status=open") {
    return TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)
    )
  }

  it.each([authGuard, guestGuard])("waits for delayed session restoration: %s", guard => {
    const result = check(guard)
    expect(isObservable(result)).toBe(true)
    const next = vi.fn()
    ;(result as Observable<boolean | UrlTree>).subscribe(next)
    expect(next).not.toHaveBeenCalled()
    currentUser.next(Result.success(session))
    expect(next).toHaveBeenCalledOnce()
    const decision = next.mock.calls[0][0]
    expect(guard === authGuard ? decision : TestBed.inject(Router).serializeUrl(decision)).toBe(
      guard === authGuard ? true : "/admin"
    )
    expect(TestBed.inject(AuthStore).session()).toBe(session)
  })

  it.each([authGuard, guestGuard])("ignores pending restoration after logout: %s", async guard => {
    const decision = firstValueFrom(check(guard) as Observable<boolean | UrlTree>)
    expect(currentUser.observed).toBe(true)
    const store = TestBed.inject(AuthStore)
    store.logout()
    currentUser.next(Result.success(session))
    const result = await decision
    if (guard === guestGuard) expect(result).toBe(true)
    else {
      expect(result).toBeInstanceOf(UrlTree)
      expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
        "/login?returnUrl=%2Fadmin%2Forders%3Fstatus%3Dopen"
      )
    }
    expect(store.session()).toBeNull()
    expect(store.isAuthenticated()).toBe(false)
  })

  function connectHttp() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" }
      ]
    })
    TestBed.overrideProvider(AUTH_REPOSITORY, {
      useFactory: () => TestBed.inject(AuthRepositoryImpl)
    })
    return TestBed.inject(HttpTestingController)
  }

  it("never restores a browser demo flag into a fresh connected store", async () => {
    const http = connectHttp()
    localStorage.setItem("authenticated", "true")
    try {
      const protectedDecision = await firstValueFrom(
        check(authGuard) as Observable<boolean | UrlTree>
      )
      expect(TestBed.inject(Router).serializeUrl(protectedDecision as UrlTree)).toBe(
        "/login?returnUrl=%2Fadmin%2Forders%3Fstatus%3Dopen"
      )
      expect(await firstValueFrom(check(guestGuard) as Observable<boolean | UrlTree>)).toBe(true)
      expect(TestBed.inject(AuthStore).session()).toBeNull()
      http.expectNone(() => true)
    } finally {
      localStorage.removeItem("authenticated")
    }
  })

  it("both guards reject an expired real-login local session without remote identity requests", async () => {
    const http = connectHttp()
    vi.useFakeTimers()
    try {
      const store = TestBed.inject(AuthStore)
      const login = firstValueFrom(
        store.login({ email: "fake@example.test", password: "FakePassword1" })
      )
      http.expectOne("http://localhost:8080/api/auth/login").flush({
        token: "fake-token",
        tipo: "Bearer",
        expiraEnSegundos: 1,
        refreshToken: "fake-refresh",
        refreshExpiraEnSegundos: 1,
        usuario: {
          idUsuario: 7,
          nombre: "Fake Name",
          correo: "fake@example.test",
          idRol: 3,
          rol: "Operaciones",
          idioma: "es",
          permisos: [],
          debeCambiarPassword: false
        }
      })
      expect((await login).success).toBe(true)
      expect(await firstValueFrom(check(authGuard) as Observable<boolean | UrlTree>)).toBe(true)
      // Simulate a suspended tab: the deadline passed before scheduled callbacks ran.
      vi.setSystemTime(Date.now() + 1000)
      const decision = await firstValueFrom(check(authGuard) as Observable<boolean | UrlTree>)
      expect(TestBed.inject(Router).serializeUrl(decision as UrlTree)).toBe(
        "/login?returnUrl=%2Fadmin%2Forders%3Fstatus%3Dopen"
      )
      expect(await firstValueFrom(check(guestGuard) as Observable<boolean | UrlTree>)).toBe(true)
      expect(store.session()).toBeNull()
      expect(store.isAuthenticated()).toBe(false)
      http.verify()
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([authGuard, guestGuard])("uses an already restored session: %s", async guard => {
    me.mockReturnValue(of(Result.success(session)))
    await firstValueFrom(TestBed.inject(AuthStore).restoreSession())
    me.mockClear()
    const decision = await firstValueFrom(check(guard) as Observable<boolean | UrlTree>)
    expect(
      guard === authGuard ? decision : TestBed.inject(Router).serializeUrl(decision as UrlTree)
    ).toBe(guard === authGuard ? true : "/admin")
    expect(me).not.toHaveBeenCalled()
  })

  it("redirects absent users with the requested safe URL", () => {
    const next = vi.fn()
    ;(check(authGuard) as Observable<boolean | UrlTree>).subscribe(next)
    currentUser.next(Result.failure(new AuthError("UNEXPECTED")))
    expect(TestBed.inject(Router).serializeUrl(next.mock.calls[0][0])).toBe(
      "/login?returnUrl=%2Fadmin%2Forders%3Fstatus%3Dopen"
    )
  })

  it.each(["//external.example", "https://external.example"])(
    "rejects unsafe return URL %s",
    url => {
      const next = vi.fn()
      ;(check(authGuard, url) as Observable<boolean | UrlTree>).subscribe(next)
      currentUser.next(Result.failure(new AuthError("UNEXPECTED")))
      expect(TestBed.inject(Router).serializeUrl(next.mock.calls[0][0])).toBe(
        "/login?returnUrl=%2Fadmin"
      )
    }
  )

  it("allows an absent user on login", () => {
    const next = vi.fn()
    ;(check(guestGuard) as Observable<boolean | UrlTree>).subscribe(next)
    currentUser.next(Result.failure(new AuthError("UNEXPECTED")))
    expect(next).toHaveBeenCalledWith(true)
  })

  // WP11 T2/S3: the shared decision, not a second guard, owns `/staff` too.
  it("guards /staff with the same shared decision", () => {
    expect(portalGuard).toBe(authGuard)
    expect(staffGuard).toBe(authGuard)
  })

  it("sends a field-staff session out of the backoffice to its own experience", async () => {
    me.mockReturnValue(of(Result.success(fieldStaffSession())))
    const decision = await firstValueFrom(
      check(staffGuard, "/admin/operations/requests") as Observable<boolean | UrlTree>
    )
    expect(decision).toBeInstanceOf(UrlTree)
    expect(TestBed.inject(Router).serializeUrl(decision as UrlTree)).toBe("/staff")
  })

  it("allows a field-staff session to open /staff", async () => {
    me.mockReturnValue(of(Result.success(fieldStaffSession())))
    const decision = await firstValueFrom(
      check(staffGuard, "/staff/services") as Observable<boolean | UrlTree>
    )
    expect(decision).toBe(true)
  })

  it("keeps a customer out of /staff", async () => {
    me.mockReturnValue(of(Result.success(customerSession())))
    const decision = await firstValueFrom(
      check(staffGuard, "/staff/services") as Observable<boolean | UrlTree>
    )
    expect(TestBed.inject(Router).serializeUrl(decision as UrlTree)).toBe("/portal")
  })

  it("keeps the backoffice audience out of /staff", async () => {
    me.mockReturnValue(of(Result.success(session)))
    const decision = await firstValueFrom(
      check(staffGuard, "/staff/services") as Observable<boolean | UrlTree>
    )
    expect(TestBed.inject(Router).serializeUrl(decision as UrlTree)).toBe("/admin")
  })

  it("sends a field-staff guest to /staff instead of the backoffice", async () => {
    me.mockReturnValue(of(Result.success(fieldStaffSession())))
    const decision = await firstValueFrom(check(guestGuard) as Observable<boolean | UrlTree>)
    expect(TestBed.inject(Router).serializeUrl(decision as UrlTree)).toBe("/staff")
  })

  it.each([authGuard, guestGuard])("fails closed on observable errors: %s", guard => {
    me.mockReturnValue(throwError(() => new Error("offline")))
    const next = vi.fn()
    ;(check(guard) as Observable<boolean | UrlTree>).subscribe(next)
    const decision = next.mock.calls[0][0]
    expect(guard === guestGuard ? decision : TestBed.inject(Router).serializeUrl(decision)).toBe(
      guard === guestGuard ? true : "/login?returnUrl=%2Fadmin%2Forders%3Fstatus%3Dopen"
    )
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(false)
  })
})
