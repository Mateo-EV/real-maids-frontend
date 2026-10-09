import { TestBed } from "@angular/core/testing"
import { of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { UserSessionInMemorySource } from "../source/user-session-in-memory.source"
import { UserSessionRepositoryImpl } from "./user-session.repository-impl"
import { appConfig } from "@/app/core/config/app.config"

describe("UserSessionRepositoryImpl", () => {
  it("uses the composition-root alias and delegates to the shared source", () => {
    TestBed.configureTestingModule({ providers: [appConfig.providers] })
    const repository = TestBed.inject(USER_SESSION_REPOSITORY)
    expect(repository).toBe(TestBed.inject(UserSessionRepositoryImpl))
    const source = TestBed.inject(UserSessionInMemorySource)
    const query = of(Result.success([])),
      revoke = of(Result.failure(new UserSessionError("SESSION_NOT_FOUND")))
    vi.spyOn(source, "getUserSessions").mockReturnValue(query)
    const spy = vi.spyOn(source, "revokeUserSession").mockReturnValue(revoke)
    expect(repository.getUserSessions()).toBe(query)
    expect(repository.revokeUserSession(9, 8)).toBe(revoke)
    expect(spy).toHaveBeenCalledExactlyOnceWith(9, 8)
  })
})
