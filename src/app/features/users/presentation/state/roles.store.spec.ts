import { TestBed } from "@angular/core/testing"
import { EMPTY, of, Subject, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { Role } from "../../domain/entities/role.entity"
import { RoleError } from "../../domain/errors/role.error"
import { CreateRoleUseCase } from "../../application/use-cases/create-role.use-case"
import { GetRolesUseCase } from "../../application/use-cases/get-roles.use-case"
import { UpdateRoleByIdUseCase } from "../../application/use-cases/update-role-by-id.use-case"
import { DeleteRoleByIdUseCase } from "../../application/use-cases/delete-role-by-id.use-case"
import { RolesStore } from "./roles.store"

const params = { name: "Demo", description: "Fictitious", isActive: true }
const role = Role.create(1, params.name, params.description, true, new Date())
describe("RolesStore", () => {
  let store: InstanceType<typeof RolesStore>
  const list = { execute: vi.fn() },
    create = { execute: vi.fn() },
    update = { execute: vi.fn() },
    remove = { execute: vi.fn() }
  beforeEach(() => {
    vi.resetAllMocks()
    TestBed.configureTestingModule({
      providers: [
        { provide: GetRolesUseCase, useValue: list },
        { provide: CreateRoleUseCase, useValue: create },
        { provide: UpdateRoleByIdUseCase, useValue: update },
        { provide: DeleteRoleByIdUseCase, useValue: remove }
      ]
    })
    store = TestBed.inject(RolesStore)
  })
  it("defers requests and resets loading on completion, cancellation and empty completion", () => {
    const response = new Subject<Result<Role[], RoleError>>()
    list.execute.mockReturnValue(response)
    const request = store.loadRoles()
    expect(store.loading()).toBe(false)
    expect(list.execute).not.toHaveBeenCalled()
    const subscription = request.subscribe()
    expect(store.loading()).toBe(true)
    subscription.unsubscribe()
    expect(store.loading()).toBe(false)
    list.execute.mockReturnValue(EMPTY)
    store.loadRoles().subscribe()
    expect(store.loading()).toBe(false)
    list.execute.mockReturnValue(of(Result.success([])))
    store.loadRoles().subscribe()
    expect(store.roles()).toEqual([])
    expect(store.loaded()).toBe(true)
  })
  it("applies CRUD and records failures without altering records", () => {
    create.execute.mockReturnValue(of(Result.success(role)))
    store.createRole(params).subscribe()
    expect(store.roles()).toEqual([role])
    const changed = Role.create(1, "Changed", "Fictitious", false, role.createdAt)
    update.execute.mockReturnValue(of(Result.success(changed)))
    store.updateRoleById(1, { ...params, isActive: false }).subscribe()
    expect(store.roles()).toEqual([changed])
    const error = new RoleError("ROLE_IN_USE")
    remove.execute.mockReturnValue(of(Result.failure(error)))
    store.deleteRoleById(1).subscribe()
    expect(store.error()).toBe(error)
    expect(store.roles()).toEqual([changed])
    remove.execute.mockReturnValue(of(Result.success(undefined)))
    store.deleteRoleById(1).subscribe()
    expect(store.roles()).toEqual([])
    expect(store.error()).toBeUndefined()
  })
  it("normalizes thrown errors and keeps existing data on load failure", () => {
    list.execute.mockReturnValue(of(Result.success([role])))
    store.loadRoles().subscribe()
    list.execute.mockReturnValue(throwError(() => new Error("offline")))
    store.loadRoles().subscribe()
    expect(store.error()).toMatchObject({ code: "UNEXPECTED" })
    expect(store.roles()).toEqual([role])
    create.execute.mockImplementation(() => {
      throw new Error("sync")
    })
    store.createRole(params).subscribe()
    expect(store.loading()).toBe(false)
    expect(store.error()).toMatchObject({ code: "UNEXPECTED" })
  })
  it("keeps records on create/update/list domain failures and does not mark failed loads as loaded", () => {
    const error = new RoleError("UNEXPECTED")
    list.execute.mockReturnValue(of(Result.failure(error)))
    store.loadRoles().subscribe()
    expect(store.loaded()).toBe(false)
    expect(store.error()).toBe(error)
    create.execute.mockReturnValue(of(Result.success(role)))
    store.createRole(params).subscribe()
    create.execute.mockReturnValue(of(Result.failure(error)))
    store.createRole(params).subscribe()
    expect(store.roles()).toEqual([role])
    expect(store.error()).toBe(error)
    update.execute.mockReturnValue(of(Result.failure(new RoleError("ROLE_NOT_FOUND"))))
    store.updateRoleById(1, params).subscribe()
    expect(store.roles()).toEqual([role])
    expect(store.error()).toMatchObject({ code: "ROLE_NOT_FOUND" })
  })
  it("does not let stale list failures overwrite current mutation feedback", () => {
    const stale = new Subject<Result<Role[], RoleError>>()
    list.execute.mockReturnValue(stale)
    store.loadRoles().subscribe()
    create.execute.mockReturnValue(of(Result.success(role)))
    store.createRole(params).subscribe()
    stale.next(Result.failure(new RoleError("UNEXPECTED")))
    stale.complete()
    expect(store.error()).toBeUndefined()
    expect(store.roles()).toEqual([role])
    expect(store.loading()).toBe(false)
  })
  it("ignores stale loads after mutations and older overlapping loads", () => {
    const stale = new Subject<Result<Role[], RoleError>>()
    list.execute.mockReturnValue(stale)
    store.loadRoles().subscribe()
    const mutation = new Subject<Result<Role, RoleError>>()
    create.execute.mockReturnValue(mutation)
    store.createRole(params).subscribe()
    mutation.next(Result.success(role))
    mutation.complete()
    expect(store.loading()).toBe(true)
    stale.next(Result.success([]))
    stale.complete()
    expect(store.roles()).toEqual([role])
    expect(store.loading()).toBe(false)
    const older = new Subject<Result<Role[], RoleError>>()
    list.execute.mockReturnValue(older)
    store.loadRoles().subscribe()
    list.execute.mockReturnValue(of(Result.success([role])))
    store.loadRoles().subscribe()
    older.next(Result.success([]))
    older.complete()
    expect(store.roles()).toEqual([role])
  })
})
