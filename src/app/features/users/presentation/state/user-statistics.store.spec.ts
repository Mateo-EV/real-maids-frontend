import { signal } from "@angular/core"
import { describe, expect, it } from "vitest"
import { selectUserStatistics, UserStatisticsEntry } from "./user-statistics.store"

describe("readonly statistics projection", () => {
  it("selects root state without owning copies and treats zero as verified", () => {
    const entry = signal<UserStatisticsEntry>({
      result: undefined,
      loading: false,
      refreshing: false,
      error: undefined,
      expires: 0
    })
    const left = selectUserStatistics(entry),
      right = selectUserStatistics(entry)
    expect(left.loaded()).toBe(false)
    for (const projection of Object.values(left)) expect(projection).not.toHaveProperty("set")
    const result = { total: 0, active: 0, inactive: 0 }
    entry.set({ ...entry(), result, expires: 120000 })
    expect(left.loaded()).toBe(true)
    expect(left.result()).toBe(result)
    expect(right.result()).toBe(left.result())
    expect(left.expires()).toBe(120000)
  })
})
