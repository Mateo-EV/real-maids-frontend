import { describe, expect, it } from "vitest"
import { RolePermission } from "./role-permission.entity"

describe("RolePermission schema association", () => {
  it("preserves the independent join ID and both numeric foreign keys", () => {
    const association = RolePermission.create(12, 3, 47)
    expect(association).toBeInstanceOf(RolePermission)
    expect(association).toEqual({ id: 12, roleId: 3, permissionId: 47 })
  })
})
