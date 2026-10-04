import { TestBed } from "@angular/core/testing"
import { EMPTY, firstValueFrom, Observable, of, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { Role } from "../../domain/entities/role.entity"
import { RoleError } from "../../domain/errors/role.error"
import { UserError } from "../../domain/errors/user.error"
import { USER_REPOSITORY } from "../../domain/repositories/user.repository"
import { Lang } from "../../domain/entities/user.entity"
import { UserInMemorySource } from "./user-in-memory.source"
import { RoleInMemorySource } from "./role-in-memory.source"

const params = { name: "Demo role", description: "Fictitious catalog", isActive: true }
async function data<T>(stream: Observable<Result<T, RoleError>>): Promise<T> {
  const result = await firstValueFrom(stream)
  if (!result.success) throw result.error
  return result.data
}

describe("RoleInMemorySource", () => {
  let source: RoleInMemorySource
  let users: UserInMemorySource
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: USER_REPOSITORY, useExisting: UserInMemorySource }] })
    source = TestBed.inject(RoleInMemorySource)
    users = TestBed.inject(UserInMemorySource)
  })

  it("starts empty and creates lazily with sequential IDs and independent dates", async () => {
    const input = { ...params }
    const stream = source.createRole(input)
    input.name = "Changed"
    expect(await data(source.getRoles())).toEqual([])
    const first = await data(stream)
    expect(first).toBeInstanceOf(Role)
    expect(first).toMatchObject({ id: 1, ...params })
    expect(first.createdAt).toBeInstanceOf(Date)
    first.createdAt.setTime(0)
    first.name = "Leaked"
    const second = await data(stream)
    expect(second.id).toBe(2)
    const list = await data(source.getRoles())
    expect(list[0].name).toBe(params.name)
    expect(list[0].createdAt.getTime()).not.toBe(0)
    list[0].createdAt.setTime(0)
    list.length = 0
    expect((await data(source.getRoleById(1))).createdAt.getTime()).not.toBe(0)
    await data(source.deleteRoleById(2))
    expect((await data(source.createRole(params))).id).toBe(3)
  })

  it("updates lazily, preserves createdAt and isolates update/read results", async () => {
    const created = await data(source.createRole(params))
    const changes = { ...params, name: "Changed", isActive: false }
    const stream = source.updateRoleById(created.id, changes)
    changes.name = "Leaked"
    expect(await data(source.getRoleById(created.id))).toEqual(created)
    const updated = await data(stream)
    expect(updated).toMatchObject({ name: "Changed", isActive: false, createdAt: created.createdAt })
    updated.createdAt.setTime(0)
    updated.description = "Leaked"
    const fresh = await data(source.getRoleById(created.id))
    expect(fresh.createdAt).toEqual(created.createdAt)
    expect(fresh.description).toBe(params.description)
    fresh.name = "Leaked"
    expect((await data(source.getRoleById(created.id))).name).toBe("Changed")
  })

  for (const operation of ["read", "update", "delete"] as const) {
    it(`reports missing ${operation} without altering the catalog`, async () => {
      const existing = await data(source.createRole(params))
      const request: Observable<Result<Role | void, RoleError>> = operation === "read" ? source.getRoleById(99)
        : operation === "update" ? source.updateRoleById(99, params) : source.deleteRoleById(99)
      expect(await firstValueFrom(request)).toMatchObject({ success: false, error: { code: "ROLE_NOT_FOUND" } })
      expect(await data(source.getRoles())).toEqual([existing])
    })
  }

  for (const isActive of [true, false]) {
    it(`refuses deletion assigned to an ${isActive ? "active" : "inactive"} user; allows deactivation`, async () => {
      const role = await data(source.createRole(params))
      const result = await firstValueFrom(users.createUser({ name: "Demo", age: 30, email: "demo@example.com",
        password: "unused", lang: Lang.EN, isActive, roleId: role.id }))
      if (!result.success) throw result.error
      const deletion = source.deleteRoleById(role.id)
      await data(source.updateRoleById(role.id, { ...params, isActive: false }))
      expect(await firstValueFrom(deletion)).toMatchObject({ success: false, error: { code: "ROLE_IN_USE" } })
      const user = await firstValueFrom(users.getUserById(result.data.id))
      expect(user).toMatchObject({ success: true, data: { roleId: role.id } })
      await firstValueFrom(users.deleteUserById(result.data.id))
      expect(await data(deletion)).toBeUndefined()
      expect(await firstValueFrom(deletion)).toMatchObject({ success: false, error: { code: "ROLE_NOT_FOUND" } })
    })
  }

  it("rechecks updates on repeated subscriptions and does not retain extra fields", async () => {
    const input = { ...params, extra: "not retained" }
    const changes = { ...input, isActive: false }
    const role = await data(source.createRole(input))
    const stream = source.updateRoleById(role.id, changes)
    expect(await data(stream)).toMatchObject({ isActive: false })
    await data(source.deleteRoleById(role.id))
    expect(await firstValueFrom(stream)).toMatchObject({ success: false, error: { code: "ROLE_NOT_FOUND" } })
    expect(role).not.toHaveProperty("extra")
    expect(JSON.stringify(source)).not.toContain("not retained")
  })

  it("allows deletion after a user changes role and checks assignments at subscription time", async () => {
    const role = await data(source.createRole(params))
    const another = await data(source.createRole(params))
    const deletion = source.deleteRoleById(role.id)
    const input = { name: "Demo", age: 30, email: "demo@example.com", password: "unused",
      lang: Lang.EN, isActive: false, roleId: role.id }
    const user = await firstValueFrom(users.createUser(input))
    if (!user.success) throw user.error
    expect(await firstValueFrom(deletion)).toMatchObject({ success: false, error: { code: "ROLE_IN_USE" } })
    await firstValueFrom(users.updateUserById(user.data.id, { ...input, roleId: another.id }))
    expect(await data(deletion)).toBeUndefined()
  })

  it("fails closed on failed, thrown or empty reference queries", async () => {
    const role = await data(source.createRole(params))
    const query = vi.spyOn(users, "getUsers")
    query.mockReturnValue(of(Result.failure(new UserError("UNEXPECTED"))))
    expect(await firstValueFrom(source.deleteRoleById(role.id))).toMatchObject({ success: false, error: { code: "UNEXPECTED" } })
    query.mockReturnValue(throwError(() => new Error("offline")))
    expect(await firstValueFrom(source.deleteRoleById(role.id))).toMatchObject({ success: false, error: { code: "UNEXPECTED" } })
    query.mockReturnValue(EMPTY)
    expect(await firstValueFrom(source.deleteRoleById(role.id))).toMatchObject({ success: false, error: { code: "UNEXPECTED" } })
    query.mockImplementation(() => { throw new Error("sync") })
    expect(await firstValueFrom(source.deleteRoleById(role.id))).toMatchObject({ success: false, error: { code: "UNEXPECTED" } })
    expect(await data(source.getRoles())).toEqual([role])
  })
})
