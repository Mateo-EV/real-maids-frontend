import { Injectable } from "@angular/core"
import { Observable, map, timer } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserSession } from "../../domain/entities/user-session.entity"
import { UserSessionError } from "../../domain/errors/user-session.error"

const clone = (session: UserSession): UserSession =>
  UserSession.create(
    session.id,
    session.userId,
    session.ip,
    session.device,
    new Date(session.startDate.getTime()),
    new Date(session.expiryDate.getTime()),
    session.isCurrent
  )

@Injectable({ providedIn: "root" })
export class UserSessionInMemorySource {
  // FICTITIOUS DEMO DATA: source-owned registry for existing catalog IDs 1–4.
  // User 5 and the remaining catalog have zero sessions. IPs use documentation-only ranges.
  // ID 1 is a simulated current designation, NOT the authenticated AuthStore session.
  // Relative fixture dates keep the demo usable; UTC display is not an operational timezone policy.
  private sessions: UserSession[] = (() => {
    const now = Date.now()
    return [
      [1, 1, "Chrome · Windows"],
      [2, 1, "Safari · iPhone"],
      [3, 2, "Edge · Windows"],
      [4, 3, "Firefox · Linux"],
      [5, 3, "Chrome · Android"],
      [6, 4, "Safari · macOS"]
    ]
      .map(([id, userId, device]) =>
        UserSession.create(
          Number(id),
          Number(userId),
          `192.0.2.${id}`,
          String(device),
          new Date(now - Number(id) * 3600000),
          new Date(now + Number(id) * 86400000),
          id === 1
        )
      )
      .concat(
        UserSession.create(
          7,
          4,
          "198.51.100.7",
          "Chrome · Windows",
          new Date(now - 86400000),
          new Date(now - 1)
        )
      )
  })()

  getUserSessions(): Observable<Result<UserSession[], UserSessionError>> {
    return timer(250).pipe(
      map(() =>
        Result.success(
          this.sessions.filter(session => session.expiryDate.getTime() > Date.now()).map(clone)
        )
      )
    )
  }

  revokeUserSession(userId: number, id: number): Observable<Result<void, UserSessionError>> {
    return timer(250).pipe(
      map(() => {
        const session = this.sessions.find(
          item => item.id === id && item.userId === userId && item.expiryDate.getTime() > Date.now()
        )
        if (!session) return Result.failure(new UserSessionError("SESSION_NOT_FOUND"))
        if (session.isCurrent) return Result.failure(new UserSessionError("CURRENT_SESSION"))
        this.sessions = this.sessions.filter(item => item.id !== id)
        return Result.success<void>(undefined)
      })
    )
  }
}
