import { AuthSession } from "../../domain/entities/auth-session.entity"
import { AuthError } from "../../domain/errors/auth.error"
import {
  AuthCredentials,
  credentialToken,
  deadline,
  nonblank
} from "../session/auth-persistent-session"

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
const integerId = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= -2147483648 &&
  value <= 2147483647

export function profile(value: unknown, expiresAt: number): AuthSession {
  const p = record(value)
  if (
    !p ||
    !integerId(p["idUsuario"]) ||
    !integerId(p["idRol"]) ||
    !nonblank(p["nombre"]) ||
    !nonblank(p["correo"]) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p["correo"]) ||
    !nonblank(p["rol"]) ||
    (p["idioma"] !== "es" && p["idioma"] !== "en") ||
    !Array.isArray(p["permisos"]) ||
    !p["permisos"].every(nonblank)
  ) {
    throw new AuthError("INVALID_PROFILE")
  }
  // ultimoAcceso is unused: no invented null/date default or authorization inference.
  return AuthSession.create(
    p["nombre"],
    p["correo"],
    p["rol"],
    expiresAt,
    p["idUsuario"],
    p["idRol"],
    p["idioma"],
    p["permisos"]
  )
}

export function loginResponse(
  value: unknown,
  fixedExpiry?: number
): {
  credentials: AuthCredentials
  session: AuthSession
} {
  const data = record(value)
  const now = Date.now()
  const lifetime = (seconds: unknown) => {
    if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) || seconds <= 0) return NaN
    const expiresAt = now + seconds * 1000
    return deadline(expiresAt) && expiresAt > now ? expiresAt : NaN
  }
  if (
    !data ||
    !credentialToken(data["token"]) ||
    typeof data["tipo"] !== "string" ||
    data["tipo"].toLowerCase() !== "bearer" ||
    !deadline(lifetime(data["expiraEnSegundos"]))
  )
    throw new AuthError("INVALID_ACCESS")
  if (
    !credentialToken(data["refreshToken"]) ||
    !deadline(lifetime(data["refreshExpiraEnSegundos"]))
  )
    throw new AuthError("INVALID_REFRESH")
  const sessionExpiresAt = Math.min(
    lifetime(data["refreshExpiraEnSegundos"]),
    fixedExpiry ?? Infinity
  )
  if (sessionExpiresAt <= now) throw new AuthError("INVALID_REFRESH")
  return {
    credentials: {
      token: data["token"],
      refreshToken: data["refreshToken"],
      accessExpiresAt: Math.min(lifetime(data["expiraEnSegundos"]), sessionExpiresAt),
      sessionExpiresAt
    },
    session: profile(data["usuario"], sessionExpiresAt)
  }
}
