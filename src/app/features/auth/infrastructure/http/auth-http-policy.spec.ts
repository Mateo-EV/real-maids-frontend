import { describe, expect, it } from "vitest"
import { apiOrigin, protectedApiUrl } from "./auth-http-policy"

describe("validated API origin", () => {
  it("permits only the existing HTTP development origin", () => {
    expect(apiOrigin("http://localhost:8080")).toBe("http://localhost:8080")
    expect(apiOrigin("http://localhost:8081")).toBeNull()
    expect(apiOrigin("http://127.0.0.1:8080")).toBeNull()
    expect(apiOrigin("http://api.example.test")).toBeNull()
  })
  it("fails closed in production unless an HTTPS origin is configured", () => {
    expect(apiOrigin(null, true)).toBeNull()
    expect(apiOrigin("http://localhost:8080", true)).toBeNull()
    expect(apiOrigin("https://api.example.test", true)).toBe("https://api.example.test")
    expect(apiOrigin("https://user:password@api.example.test", true)).toBeNull()
  })
  it("does not infer backend origin for relative frontend requests", () => {
    expect(protectedApiUrl("/api/usuarios", "https://api.example.test")).toBe(false)
    expect(
      protectedApiUrl("https://api.example.test/api/usuarios", "https://api.example.test")
    ).toBe(true)
    expect(
      protectedApiUrl(
        "https://user:password@api.example.test/api/usuarios",
        "https://api.example.test"
      )
    ).toBe(false)
  })
})
