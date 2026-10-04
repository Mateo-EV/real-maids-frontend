import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserError } from "../../domain/errors/user.error"
import { Lang } from "../../domain/entities/user.entity"
import { describe, expect, it, vi } from "vitest"
import { USER_REPOSITORY } from "../../domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "../../domain/repositories/role.repository"
import { UserInMemorySource } from "../../infrastructure/source/user-in-memory.source"
import { RoleInMemorySource } from "../../infrastructure/source/role-in-memory.source"
import { UserStore } from "../state/user.store"
import { RolesStore } from "../state/roles.store"
import { UsersDemoInitializer } from "./users-demo-initializer"
import { demoDecoration } from "./users-demo.fixture"

export const demoProviders = [
  { provide: USER_REPOSITORY, useExisting: UserInMemorySource },
  { provide: ROLE_REPOSITORY, useExisting: RoleInMemorySource }
]

describe("Users demo initialization boundary", () => {
  function setup(platform = "browser") {
    TestBed.configureTestingModule({ providers: [...demoProviders, { provide: PLATFORM_ID, useValue: platform }] })
    return { initializer: TestBed.inject(UsersDemoInitializer), users: TestBed.inject(UserStore), roles: TestBed.inject(RolesStore) }
  }

  it("seeds five roles before 48 users with actual role ids and 42/6 status split", async () => {
    const { initializer, users, roles } = setup()
    const create = vi.spyOn(users, "createUser")
    await initializer.initialize()
    expect(roles.roles()).toHaveLength(5)
    expect(users.users()).toHaveLength(48)
    expect(users.users().filter(user => user.isActive)).toHaveLength(42)
    expect(users.users().filter(user => !user.isActive)).toHaveLength(6)
    expect(users.users().every(user => roles.roles().some(role => role.id === user.roleId))).toBe(true)
    expect(create).toHaveBeenCalledTimes(48)
    expect(users.users()[0].name).toBe("Carlos Mendoza")
    const displayCopy = [
      ...roles.roles().map(role => `${role.name} ${role.description}`),
      ...users.users().map(user => `${user.name} ${user.email} ${demoDecoration(user).entity}`)
    ].join(" ")
    expect(displayCopy).not.toMatch(/demo|demostración|en memoria|fictici|de ejemplo|sin ACL|concede permisos/i)
    expect(users.users().every(user => user.email.endsWith("@example.test"))).toBe(true)
    expect(users.users().slice(0, 5).map(user => demoDecoration(user).entity)).toEqual([
      "Interno (Staff)", "Despacho Central", "personal_campo: #PC-08", "cliente: #CLI-204", "personal_campo: #PC-15"
    ])
    expect(users.users().some(user => user.lastAccess === null)).toBe(true)
  })

  it("coalesces concurrent entry and does not resurrect deleted demo records on navigation", async () => {
    const { initializer, users, roles } = setup()
    await Promise.all([initializer.initialize(), initializer.initialize()])
    expect(users.users()).toHaveLength(48)
    const id = users.users()[0].id
    await firstValueFrom(users.deleteUserById(id))
    await initializer.initialize()
    expect(users.users()).toHaveLength(47)
    expect(users.users().some(user => user.id === id)).toBe(false)
    expect(roles.roles()).toHaveLength(5)
  })

  it("preserves existing catalog data instead of mixing fixtures into manual work", async () => {
    const { initializer, users, roles } = setup()
    const role = await firstValueFrom(roles.createRole({ name: "Manual", description: "Existing work", isActive: false }))
    expect(role.success).toBe(true)
    await initializer.initialize()
    expect(roles.roles().map(item => item.name)).toEqual(["Manual"])
    expect(users.users()).toEqual([])
  })

  it("preserves existing users even if the role catalog is empty", async () => {
    const { initializer, users, roles } = setup()
    await firstValueFrom(users.createUser({ name: "Manual User", age: 32, email: "manual@example.test", password: "unused", roleId: 999, lang: Lang.ES, isActive: false }))
    await initializer.initialize()
    expect(users.users().map(user => user.name)).toEqual(["Manual User"])
    expect(roles.roles()).toEqual([])
  })

  it("does not seed after a load failure and allows an explicit retry", async () => {
    const { initializer, users, roles } = setup()
    vi.spyOn(users, "loadUsers").mockReturnValueOnce(of(Result.failure(new UserError("UNEXPECTED"))))
    await expect(initializer.initialize()).rejects.toMatchObject({ code: "UNEXPECTED" })
    expect(users.users()).toEqual([])
    expect(roles.roles()).toEqual([])
    await initializer.initialize()
    expect(users.users()).toHaveLength(48)
  })

  it("never seeds on the server", async () => {
    const { initializer, users, roles } = setup("server")
    await initializer.initialize()
    expect(users.users()).toEqual([])
    expect(roles.roles()).toEqual([])
  })
})
