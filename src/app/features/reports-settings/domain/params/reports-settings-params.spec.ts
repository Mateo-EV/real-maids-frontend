import { describe, expect, it } from "vitest"
import {
  normalizeGenerateReportParams,
  normalizeReportHistoryQuery,
  normalizeReportPeriod,
  reportRequestKey
} from "./reports-settings.params"

// W6 / S4, S5: the request identity of one generation, captured before any dispatch.
describe("Releases report request normalization", () => {
  it("trims the chosen type and omits a blank period", () => {
    expect(normalizeGenerateReportParams({ type: "  CLIENTES  " })).toEqual({ type: "CLIENTES" })
    expect(
      normalizeGenerateReportParams({ type: "CLIENTES", from: " ", to: "2026-01-31" })
    ).toEqual({ type: "CLIENTES", to: "2026-01-31" })
    expect(
      normalizeGenerateReportParams({ type: "CLIENTES", from: "2024-02-29", to: "2024-02-29" })
    ).toEqual({ type: "CLIENTES", from: "2024-02-29", to: "2024-02-29" })
  })

  it("refuses a blank type and an unusable period instead of guessing one", () => {
    for (const params of [
      { type: "" },
      { type: "   " },
      { type: 7 as unknown as string },
      { type: "CLIENTES", from: "2026-02-30" },
      { type: "CLIENTES", from: "2026-01-31", to: "2026-01-01" },
      { type: "CLIENTES", from: "ayer" }
    ])
      expect(normalizeGenerateReportParams(params), JSON.stringify(params)).toBeUndefined()
    expect(normalizeReportPeriod({ from: "2026-1-1" })).toBeUndefined()
    expect(normalizeReportPeriod({ from: "2024-02-29" })).toEqual({ from: "2024-02-29" })
  })

  it("identifies one generation by its type and period only", () => {
    expect(reportRequestKey({ type: "CLIENTES" })).toBe(reportRequestKey({ type: "CLIENTES" }))
    expect(reportRequestKey({ type: "CLIENTES" })).not.toBe(
      reportRequestKey({ type: "CLIENTES", from: "2026-01-01" })
    )
    expect(reportRequestKey({ type: "CLIENTES", to: "2026-01-31" })).not.toBe(
      reportRequestKey({ type: "ORDENES", to: "2026-01-31" })
    )
  })

  it("bounds the history page to the backend maximum and aligned offsets", () => {
    expect(normalizeReportHistoryQuery()).toEqual({ offset: 0, limit: 20 })
    expect(normalizeReportHistoryQuery({ offset: 40, limit: 20 })).toEqual({
      offset: 40,
      limit: 20
    })
    for (const query of [
      { offset: 30, limit: 20 },
      { offset: 0, limit: 0 },
      { offset: 0, limit: 101 },
      { offset: -20, limit: 20 },
      { offset: 0, limit: 20.5 }
    ])
      expect(normalizeReportHistoryQuery(query), JSON.stringify(query)).toBeUndefined()
  })
})
