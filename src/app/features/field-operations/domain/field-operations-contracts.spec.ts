import { Injector } from "@angular/core"
import { firstValueFrom, of } from "rxjs"
import { expect, expectTypeOf, it } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { FieldOperationsError } from "./errors/field-operations.error"
import {
  FIELD_OPERATIONS_REPOSITORY,
  FieldOperationsRepository
} from "./repositories/field-operations.repository"
import {
  CreateFieldStaffParams,
  CreateCrewParams,
  CreateWorkLogParams,
  UpdateServiceChecklistParams,
  CreateServiceEvidenceParams,
  LinkStaffAccountParams,
  ReplaceStaffAvailabilityParams
} from "./params/field-operations.params"

it("binds all staff, crew and execution capabilities with typed errors", async () => {
  const error = new FieldOperationsError("NOT_FOUND", "Staff record not found")
  expect(error).toBeInstanceOf(Error)
  expect(error.name).toBe("FieldOperationsError")
  expect(error.code).toBe("NOT_FOUND")
  expect(error.message).toBe("Staff record not found")
  const fail = () => of(Result.failure(error))
  const repository: FieldOperationsRepository = {
    getStaff: fail,
    getStaffById: fail,
    getMyStaffProfile: fail,
    createStaff: fail,
    updateStaff: fail,
    setStaffStatus: fail,
    linkStaffAccount: fail,
    replaceAvailability: fail,
    getCrews: fail,
    getCrew: fail,
    createCrew: fail,
    updateCrew: fail,
    getCrewMembers: fail,
    createCrewMember: fail,
    updateCrewMember: fail,
    getWorkLogs: fail,
    createWorkLog: fail,
    updateWorkLog: fail,
    getChecklist: fail,
    createChecklistItem: fail,
    updateChecklistItem: fail,
    getEvidence: fail,
    createEvidence: fail,
    updateEvidence: fail
  }
  const injector = Injector.create({
    providers: [{ provide: FIELD_OPERATIONS_REPOSITORY, useValue: repository }]
  })
  expect(injector.get(FIELD_OPERATIONS_REPOSITORY)).toBe(repository)
  for (const operation of Object.values(repository)) {
    const result = await firstValueFrom<Result<unknown, FieldOperationsError>>(operation())
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe(error)
  }
})

it("supports account unlinking and empty whole-availability replacement", async () => {
  const staff = {
    id: 3,
    name: "Staff",
    document: "DOC-3",
    phone: null,
    email: null,
    language: "es",
    joinedOn: null,
    isActive: true,
    userId: null,
    availability: [],
    createdAt: new Date("2028-02-29T10:00:00Z")
  }
  const link: FieldOperationsRepository["linkStaffAccount"] = (_id, params) => {
    expect(params.userId).toBeNull()
    return of(Result.success(staff))
  }
  const availability: FieldOperationsRepository["replaceAvailability"] = (_id, params) => {
    expect(params.slots).toEqual([])
    return of(Result.success(staff))
  }
  for (const result of [
    await firstValueFrom(link(3, { userId: null })),
    await firstValueFrom(availability(3, { slots: [] }))
  ]) {
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual(staff)
  }
  expectTypeOf<LinkStaffAccountParams["userId"]>().toEqualTypeOf<number | null>()
  expectTypeOf<ReplaceStaffAvailabilityParams["slots"][number]["weekday"]>().toEqualTypeOf<string>()
  expectTypeOf<
    Extract<
      "id" | "userId" | "createdAt" | "isActive" | "sourceSystem",
      keyof CreateFieldStaffParams
    >
  >().toEqualTypeOf<never>()
  expectTypeOf<Extract<"id" | "createdAt", keyof CreateCrewParams>>().toEqualTypeOf<never>()
  expectTypeOf<CreateWorkLogParams["endedAt"]>().toEqualTypeOf<Date | null>()
  expectTypeOf<
    Extract<"registeredAt" | "orderId" | "taskId", keyof UpdateServiceChecklistParams>
  >().toEqualTypeOf<never>()
  expectTypeOf<
    Extract<"id" | "uploadedAt", keyof CreateServiceEvidenceParams>
  >().toEqualTypeOf<never>()
})
