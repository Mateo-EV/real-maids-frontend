import { AuthError } from "../../domain/errors/auth.error"
import { profile } from "./auth-response"

const baseProfile = {
  idUsuario: 7,
  nombre: "Cliente Portal",
  correo: "cliente@example.test",
  idRol: 4,
  rol: "Cliente",
  idioma: "es",
  permisos: []
}

describe("auth profile password flag", () => {
  it("keeps a cleared flag false", () => {
    expect(profile({ ...baseProfile, debeCambiarPassword: false }, 1000).mustChangePassword).toBe(
      false
    )
  })

  it("carries a provisional password flag true", () => {
    expect(profile({ ...baseProfile, debeCambiarPassword: true }, 1000).mustChangePassword).toBe(
      true
    )
  })

  it.each([undefined, null])("fails closed when the response omits the flag (%s)", missing => {
    const value: Record<string, unknown> = { ...baseProfile }
    if (missing !== undefined) value["debeCambiarPassword"] = missing
    // A response that cannot prove the provisional password was already replaced must force the
    // step; defaulting to false would silently skip the required change.
    expect(profile(value, 1000).mustChangePassword).toBe(true)
  })

  it.each(["false", 0, 1, {}, []])("rejects a non-boolean flag: %j", flag => {
    expect(() => profile({ ...baseProfile, debeCambiarPassword: flag }, 1000)).toThrowError(
      AuthError
    )
  })
})
