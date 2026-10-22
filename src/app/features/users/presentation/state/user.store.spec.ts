import { TestBed } from "@angular/core/testing"
import { EMPTY, firstValueFrom, of, Subject, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { Lang, User } from "../../domain/entities/user.entity"
import { UserError } from "../../domain/errors/user.error"
import { CreateUserUseCase } from "../../application/use-cases/create-user.use-case"
import { UpdateUserStatusByIdUseCase } from "../../application/use-cases/update-user-status-by-id.use-case"
import { UpdateUserByIdUseCase } from "../../application/use-cases/update-user-by-id.use-case"
import { DeleteUserByIdUseCase } from "../../application/use-cases/delete-user-by-id.use-case"
import { UserStore } from "./user.store"

const params = {
  name: "Fake",
  email: "fake@example.test",
  password: "FakePassword1",
  lang: Lang.EN,
  isActive: true,
  roleId: 1
}
const user = User.create(1, params.name, params.email, Lang.EN, true, new Date(), new Date(), 1)
describe("UserStore mutation facade", () => {
  let store: InstanceType<typeof UserStore>
  const create = { execute: vi.fn() },
    update = { execute: vi.fn() },
    status = { execute: vi.fn() },
    remove = { execute: vi.fn() }
  beforeEach(() => {
    vi.resetAllMocks()
    TestBed.configureTestingModule({
      providers: [
        { provide: CreateUserUseCase, useValue: create },
        { provide: UpdateUserByIdUseCase, useValue: update },
        { provide: UpdateUserStatusByIdUseCase, useValue: status },
        { provide: DeleteUserByIdUseCase, useValue: remove }
      ]
    })
    store = TestBed.inject(UserStore)
  })
  it("exposes only write state, never a collection read or implied complete catalog", () => {
    for (const field of ["users", "loaded", "loadUsers", "total", "query"])
      expect(store).not.toHaveProperty(field)
    expect(store.mutationRevision()).toBe(0)
    expect(store.loading()).toBe(false)
  })
  it("returns each confirmed result immediately and notifies once without any read dependency", async () => {
    const result = Result.success(user)
    create.execute.mockReturnValue(of(result))
    update.execute.mockReturnValue(of(result))
    status.execute.mockReturnValue(of(result))
    const deleted = Result.success<void>(undefined)
    remove.execute.mockReturnValue(of(deleted))
    expect(await firstValueFrom(store.createUser(params))).toBe(result)
    expect(await firstValueFrom(store.updateUserById(1, params))).toBe(result)
    expect(await firstValueFrom(store.updateUserStatusById(1, false))).toBe(result)
    expect(await firstValueFrom(store.deleteUserById(1))).toBe(deleted)
    expect(store.mutationRevision()).toBe(4)
    expect(create.execute).toHaveBeenCalledExactlyOnceWith(params)
    expect(update.execute).toHaveBeenCalledExactlyOnceWith(1, params)
    expect(status.execute).toHaveBeenCalledExactlyOnceWith(1, false)
    expect(remove.execute).toHaveBeenCalledExactlyOnceWith(1)
  })
  it("preserves partial-update errors and notifies exactly once, without replay", async () => {
    const error = new UserError("PARTIAL_UPDATE"),
      result = Result.failure(error)
    update.execute.mockReturnValue(of(result))
    expect(await firstValueFrom(store.updateUserById(1, params))).toBe(result)
    expect(store.error()).toBe(error)
    expect(store.mutationRevision()).toBe(1)
    expect(update.execute).toHaveBeenCalledOnce()
  })
  it("normalizes thrown and empty failures without notifying success", async () => {
    const error = new UserError("USER_NOT_FOUND")
    for (const response of [
      of(Result.failure(error)),
      throwError(() => error),
      throwError(() => new Error("offline")),
      EMPTY
    ]) {
      status.execute.mockReturnValue(response)
      const result = await firstValueFrom(store.updateUserStatusById(1, false))
      expect(result.success).toBe(false)
      if (!result.success) expect(store.error()).toBe(result.error)
      expect(store.loading()).toBe(false)
    }
    expect(store.mutationRevision()).toBe(0)
    status.execute.mockImplementation(() => {
      throw error
    })
    await firstValueFrom(store.updateUserStatusById(1, false))
    expect(store.error()).toBe(error)
  })
  it("tracks concurrent pending writes and finalizes cancellation without notification", () => {
    const pending = new Subject<Result<User, UserError>>()
    status.execute.mockReturnValue(pending)
    const first = store.updateUserStatusById(1, false).subscribe()
    const second = store.updateUserStatusById(2, false).subscribe()
    expect(store.loading()).toBe(true)
    first.unsubscribe()
    expect(store.loading()).toBe(true)
    second.unsubscribe()
    expect(pending.observed).toBe(false)
    expect(store.loading()).toBe(false)
    expect(store.mutationRevision()).toBe(0)
  })
})
