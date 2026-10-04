import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { Lang, User } from "../../domain/entities/user.entity"
import { UserError } from "../../domain/errors/user.error"
import { CreateUserParams } from "../../domain/params/create-user.params"
import { UpdateUserParams } from "../../domain/params/update-user.params"
import { UserInMemorySource } from "./user-in-memory.source"

const createdAt = new Date("2026-01-01T10:00:00Z")
const updatedAt = new Date("2026-01-02T11:00:00Z")
const params: CreateUserParams = {
  name: "Demo user", age: 30, email: "demo@example.com", password: "demo-only",
  lang: Lang.EN, isActive: true
}
const changes: UpdateUserParams = {
  name: "Updated user", age: 42, email: "updated@example.com", lang: Lang.ES, isActive: false
}

async function data<T>(stream: Observable<Result<T, UserError>>): Promise<T> {
  const result = await firstValueFrom(stream)
  if (!result.success) throw result.error
  return result.data
}

function mutate(user: User) {
  user.id = 999
  user.name = "Leaked"
  user.age = -1
  user.email = "leaked@example.com"
  user.lang = Lang.ES
  user.isActive = false
  user.createdAt.setTime(0)
  user.updatedAt.setTime(0)
}

describe("UserInMemorySource", () => {
  let source: UserInMemorySource

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(createdAt)
    source = TestBed.inject(UserInMemorySource)
  })
  afterEach(() => vi.useRealTimers())

  it("starts empty", async () => {
    expect(await data(source.getUsers())).toEqual([])
  })

  it("creates the supplied public fields with sequential numeric IDs and current dates", async () => {
    const first = await data(source.createUser(params))
    expect(first).toBeInstanceOf(User)
    expect(first).toEqual(User.create(1, params.name, params.age, params.email, params.lang,
      params.isActive, createdAt, createdAt))
    expect((await data(source.createUser(params))).id).toBe(2)
    await data(source.deleteUserById(1))
    expect((await data(source.createUser(params))).id).toBe(3)
  })

  it("reads, updates all public fields, preserves creation time, and deletes", async () => {
    const created = await data(source.createUser(params))
    expect(await data(source.getUserById(created.id))).toEqual(created)
    vi.setSystemTime(updatedAt)
    const updated = await data(source.updateUserById(created.id, changes))
    expect(updated).toEqual(User.create(created.id, changes.name, changes.age, changes.email,
      changes.lang, changes.isActive, createdAt, updatedAt))
    expect(await data(source.getUsers())).toEqual([updated])
    expect(await data(source.deleteUserById(created.id))).toBeUndefined()
    expect(await data(source.getUsers())).toEqual([])
  })

  for (const operation of ["read", "update", "delete"] as const) {
    it(`returns USER_NOT_FOUND for missing ${operation} without changing data`, async () => {
      const existing = await data(source.createUser(params))
      const stream: Observable<Result<User | void, UserError>> = operation === "read" ? source.getUserById(99)
        : operation === "update" ? source.updateUserById(99, changes)
          : source.deleteUserById(99)
      const result = await firstValueFrom(stream)
      expect(result.success).toBe(false)
      if (result.success) throw new Error("Expected missing user failure")
      expect(result.error).toBeInstanceOf(UserError)
      expect(result.error.code).toBe("USER_NOT_FOUND")
      expect(await data(source.getUsers())).toEqual([existing])
    })
  }

  it("creates only on subscription and repeats creation with subscription-time IDs/dates", async () => {
    const stream = source.createUser(params)
    expect(await data(source.getUsers())).toEqual([])
    vi.setSystemTime(updatedAt)
    const first = await data(stream)
    expect(first.id).toBe(1)
    expect(first.createdAt).toEqual(updatedAt)
    vi.setSystemTime(new Date("2026-01-03T00:00:00Z"))
    const second = await data(stream)
    expect(second.id).toBe(2)
    expect(second.createdAt).toEqual(new Date("2026-01-03T00:00:00Z"))
  })

  it("updates on each subscription, using operation-time dates", async () => {
    const created = await data(source.createUser(params))
    const stream = source.updateUserById(created.id, changes)
    expect(await data(source.getUserById(created.id))).toEqual(created)
    vi.setSystemTime(updatedAt)
    expect((await data(stream)).updatedAt).toEqual(updatedAt)
    vi.setSystemTime(new Date("2026-01-03T00:00:00Z"))
    expect((await data(stream)).updatedAt).toEqual(new Date("2026-01-03T00:00:00Z"))
    expect((await data(source.getUserById(created.id))).createdAt).toEqual(createdAt)
  })

  it("deletes only on subscription and rechecks existence for repeated subscriptions", async () => {
    const created = await data(source.createUser(params))
    const stream = source.deleteUserById(created.id)
    expect(await data(source.getUsers())).toEqual([created])
    await data(stream)
    expect(await firstValueFrom(stream)).toMatchObject({
      success: false, error: { code: "USER_NOT_FOUND" }
    })
  })

  it("rechecks update existence at subscription time", async () => {
    const created = await data(source.createUser(params))
    const stream = source.updateUserById(created.id, changes)
    await data(source.deleteUserById(created.id))
    expect(await firstValueFrom(stream)).toMatchObject({
      success: false, error: { code: "USER_NOT_FOUND" }
    })
  })

  it("snapshots input fields without retaining mutable create/update params", async () => {
    const input = { ...params }
    const create = source.createUser(input)
    input.name = "Changed after call"
    expect((await data(create)).name).toBe(params.name)
    const update = { ...changes }
    const stream = source.updateUserById(1, update)
    update.name = "Changed after call"
    expect((await data(stream)).name).toBe(changes.name)
  })

  it("isolates entity fields, arrays and Dates from create/read/list results", async () => {
    const created = await data(source.createUser(params))
    const expected = await data(source.getUserById(created.id))
    mutate(created)
    mutate(await data(source.getUserById(1)))
    const list = await data(source.getUsers())
    mutate(list[0])
    list.push(created)
    expect(await data(source.getUsers())).toEqual([expected])
    const fresh = await data(source.getUserById(1))
    fresh.createdAt.setTime(1)
    expect(fresh.updatedAt).toEqual(createdAt)
  })

  it("reads current state and returns fresh copies on every query subscription", async () => {
    const list = source.getUsers()
    const read = source.getUserById(1)
    expect(await data(list)).toEqual([])
    await data(source.createUser(params))
    const firstRead = await data(read)
    mutate(firstRead)
    expect((await data(read)).name).toBe(params.name)
    const firstList = await data(list)
    mutate(firstList[0])
    firstList.length = 0
    expect((await data(list))[0].name).toBe(params.name)
    await data(source.deleteUserById(1))
    expect(await data(list)).toEqual([])
    expect(await firstValueFrom(read)).toMatchObject({
      success: false, error: { code: "USER_NOT_FOUND" }
    })
  })

  it("isolates update results and preserves independent Date copies", async () => {
    await data(source.createUser(params))
    vi.setSystemTime(updatedAt)
    const updated = await data(source.updateUserById(1, changes))
    const expected = await data(source.getUserById(1))
    mutate(updated)
    expect(await data(source.getUserById(1))).toEqual(expected)
  })

  it("never stores or returns passwords, including arbitrary extra input fields", async () => {
    const input = { ...params, extra: "not a user field" }
    const created = await data(source.createUser(input))
    const updated = await data(source.updateUserById(created.id, { ...changes, password: "replacement" }))
    for (const user of [created, updated, await data(source.getUserById(1)),
      ...(await data(source.getUsers()))]) {
      expect(user).not.toHaveProperty("password")
      expect(user).not.toHaveProperty("extra")
    }
    // Inspect adapter state too: public output omission alone would not prove non-storage.
    expect(JSON.stringify(source)).not.toContain("demo-only")
    expect(JSON.stringify(source)).not.toContain("replacement")
  })

  it("does not invent email uniqueness or age validation policy", async () => {
    await data(source.createUser(params))
    const duplicate = await data(source.createUser({ ...params, age: -1 }))
    expect(duplicate.email).toBe(params.email)
    expect(duplicate.age).toBe(-1)
    expect((await data(source.updateUserById(duplicate.id, { ...changes, email: params.email }))).email)
      .toBe(params.email)
  })
})
