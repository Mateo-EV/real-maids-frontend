import { describe, expect, it } from "vitest"
import { dtoDate, dtoId, dtoRecord, dtoText } from "./dto-validation"

const failure = new Error("Invalid DTO")
function invalid(): never {
  throw failure
}

describe("HTTP DTO validation primitives", () => {
  it.each([null, undefined, [], [1], "text", "", 0, 1, true, false])(
    "rejects non-record %j through the caller's error boundary",
    value => {
      expect(() => dtoRecord(value, invalid)).toThrow(failure)
    }
  )
  it("returns records unchanged without requiring a plain-object prototype", () => {
    const values = [{}, { value: "original" }, Object.create(null), new Date()]
    for (const value of values) expect(dtoRecord(value, invalid)).toBe(value)
  })
  it.each(["name", " name ", "\tname\n"])(
    "accepts nonblank text without normalization %j",
    value => {
      expect(dtoText(value)).toBe(true)
      expect(dtoRecord({ value }, invalid)["value"]).toBe(value)
    }
  )
  it.each(["", " ", "\n\t", null, undefined, 0, [], {}])("rejects non-text/blank %j", value => {
    expect(dtoText(value)).toBe(false)
  })
  it.each([-2147483648, -1, -0, 0, 2147483647])("accepts signed int32 %s", value => {
    expect(dtoId(value)).toBe(true)
  })
  it.each([-2147483649, 2147483648, 0.5, -1.5, NaN, Infinity, -Infinity, "1", null, undefined])(
    "rejects non-int32 %s",
    value => expect(dtoId(value)).toBe(false)
  )
  it.each([
    "2024-02-29T12:34:56Z",
    "2026-01-01T12:34:56.123456+05:30",
    "2026-01-01T12:34:56-04:00",
    // User/role parsing historically accepts midnight rollover; sessions reject it locally.
    "2026-01-01T24:00:00Z",
    "2000-02-29T00:00:00Z"
  ])("preserves user/role timestamp acceptance %s", value => {
    expect(dtoDate(value, invalid).getTime()).toBe(new Date(value).getTime())
  })
  it.each([
    null,
    0,
    new Date(),
    "",
    "2026-01-01",
    "2026-01-01T00:00:00",
    "2026-01-01T00:00:00Z ",
    "2026-02-29T00:00:00Z",
    "2026-02-31T00:00:00Z",
    "1900-02-29T00:00:00Z",
    "0000-02-29T00:00:00Z",
    "2026-00-01T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-01-00T00:00:00Z",
    "2026-04-31T00:00:00Z",
    "2026-01-01T25:00:00Z",
    "2026-01-01T00:60:00Z",
    "2026-01-01T00:00:60Z",
    "2026-01-01T00:00:00+24:00"
  ])("preserves user/role timestamp rejection %j", value => {
    expect(() => dtoDate(value, invalid)).toThrow(failure)
  })
})
