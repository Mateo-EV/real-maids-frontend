import { API_URL } from "@/app/core/tokens/api-url.token"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree
} from "@angular/router"
import { EMPTY, firstValueFrom, Observable, of, Subject } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthError } from "../../domain/errors/auth.error"
import { AuthSession } from "../../domain/entities/auth-session.entity"
import { AUTH_REPOSITORY } from "../../domain/repositories/auth.repository"
import { Result } from "@/app/shared/utils/result"
import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth.repository-impl"
import { AuthStore } from "../state/auth.store"
import { authGuard, guestGuard, passwordChangeGuard } from "./auth.guard"
import { PASSWORD_CHANGE_PATH, safeDestination } from "../routing/password-change-navigation"

const provisional = AuthSession.create(
  "Cliente Portal",
  "cliente@example.test",
  "Cliente",
  null,
  9,
  4,
  "es",
  [],
  true
)
const settled = AuthSession.create("Cliente Portal", "cliente@example.test", "Cliente")

describe("forced password change routing", () => {
  let currentUser: Subject<Result<AuthSession, AuthError>>
  const me = vi.fn()

  beforeEach(() => {
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
            changePassword: vi.fn(),
            sessionChanges: () => EMPTY
          }
        }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    vi.restoreAllMocks()
  })

  const router = () => TestBed.inject(Router)
  const serialize = (value: boolean | UrlTree) =>
    typeof value === "boolean" ? value : router().serializeUrl(value)

  function check(guard: typeof authGuard, url = "/admin/orders?status=open") {
    return TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)
    )
  }

  function checkPasswordChange(returnUrl?: string) {
    const route = {
      queryParamMap: convertToParamMap(returnUrl === undefined ? {} : { returnUrl })
    } as ActivatedRouteSnapshot
    return TestBed.runInInjectionContext(() =>
      passwordChangeGuard(route, { url: PASSWORD_CHANGE_PATH } as RouterStateSnapshot)
    )
  }

  it("sends a provisional session from a protected route to the change screen", async () => {
    const decision = firstValueFrom(check(authGuard) as Observable<boolean | UrlTree>)
    currentUser.next(Result.success(provisional))
    expect(serialize(await decision)).toBe(
      "/change-password?returnUrl=%2Fadmin%2Forders%3Fstatus%3Dopen"
    )
    expect(TestBed.inject(AuthStore).isAuthenticated()).toBe(true)
  })

  it("lets a settled session through without the change screen", async () => {
    const decision = firstValueFrom(check(authGuard) as Observable<boolean | UrlTree>)
    currentUser.next(Result.success(settled))
    expect(serialize(await decision)).toBe(true)
  })

  it("sends a provisional session away from the login route", async () => {
    const decision = firstValueFrom(check(guestGuard) as Observable<boolean | UrlTree>)
    currentUser.next(Result.success(provisional))
    expect(serialize(await decision)).toBe("/change-password?returnUrl=%2Fadmin")
  })

  it("keeps a provisional session on the change screen", async () => {
    const decision = firstValueFrom(checkPasswordChange("/admin/customers") as Observable<unknown>)
    currentUser.next(Result.success(provisional))
    expect(await decision).toBe(true)
  })

  it("moves a settled session from the change screen to its destination", async () => {
    const decision = firstValueFrom(checkPasswordChange("/admin/customers") as Observable<unknown>)
    currentUser.next(Result.success(settled))
    expect(serialize((await decision) as boolean | UrlTree)).toBe("/admin/customers")
  })

  it("requires a session on the change screen and keeps the destination for login", async () => {
    const decision = firstValueFrom(checkPasswordChange("/admin/customers") as Observable<unknown>)
    currentUser.next(Result.failure(new AuthError("INVALID_CREDENTIALS")))
    expect(serialize((await decision) as boolean | UrlTree)).toBe(
      "/login?returnUrl=%2Fadmin%2Fcustomers"
    )
  })

  it.each([undefined, "", "//external.example", "https://external.example", "/change-password"])(
    "neutralizes an unusable destination: %j",
    value => {
      expect(safeDestination(value)).toBe("/admin")
    }
  )

  it("rejects a change-screen destination to avoid a redirect loop", async () => {
    const decision = firstValueFrom(
      checkPasswordChange("/change-password?returnUrl=%2Fchange-password") as Observable<unknown>
    )
    currentUser.next(Result.success(settled))
    expect(serialize((await decision) as boolean | UrlTree)).toBe("/admin")
  })

  it("does not read stored credentials or dispatch HTTP while rendering on the server", async () => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" },
        { provide: PLATFORM_ID, useValue: "server" }
      ]
    })
    TestBed.overrideProvider(AUTH_REPOSITORY, {
      useFactory: () => TestBed.inject(AuthRepositoryImpl)
    })
    localStorage.setItem("real-maids.auth.v1:http://localhost:8080", '{"sensitive":"stored"}')
    const read = vi.spyOn(Storage.prototype, "getItem")
    try {
      const http = TestBed.inject(HttpTestingController)
      const protectedDecision = await firstValueFrom(
        check(authGuard) as Observable<boolean | UrlTree>
      )
      expect(serialize(protectedDecision)).toBe(
        "/login?returnUrl=%2Fadmin%2Forders%3Fstatus%3Dopen"
      )
      const changeDecision = await firstValueFrom(
        checkPasswordChange("/admin/customers") as Observable<unknown>
      )
      expect(serialize((await changeDecision) as boolean | UrlTree)).toBe(
        "/login?returnUrl=%2Fadmin%2Fcustomers"
      )
      http.expectNone(() => true)
      expect(read).not.toHaveBeenCalled()
      expect(TestBed.inject(AuthStore).session()).toBeNull()
    } finally {
      localStorage.clear()
    }
  })

  it("keeps the flag until a refreshed profile proves it cleared", async () => {
    const decision = firstValueFrom(check(authGuard) as Observable<boolean | UrlTree>)
    currentUser.next(Result.success(provisional))
    await decision
    me.mockReturnValue(of(Result.success(settled)))
    await firstValueFrom(TestBed.inject(AuthStore).refreshSession())
    const settledDecision = firstValueFrom(check(authGuard) as Observable<boolean | UrlTree>)
    expect(serialize(await settledDecision)).toBe(true)
  })
})
