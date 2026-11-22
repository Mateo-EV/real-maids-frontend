import { Injector } from "@angular/core"
import { firstValueFrom, of } from "rxjs"
import { expect, expectTypeOf, it } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { FieldOperationsError } from "./errors/field-operations.error"
import {
  FIELD_OPERATIONS_REPOSITORY,
  FieldOperationsRepository,
  StaffAccountFailure,
  StaffAccountFailureReason
} from "./repositories/field-operations.repository"
import {
  CreateFieldStaffParams,
  CreateCrewParams,
  CreateWorkLogParams,
  UpdateServiceChecklistParams,
  CreateServiceEvidenceParams,
  ReplaceStaffAvailabilityParams,
  UpdateFieldStaffParams
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
    replaceAvailability: fail,
    getAbsences: fail,
    getAbsenceById: fail,
    createAbsence: fail,
    setAbsenceStatus: fail,
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

it("carries the account tri-state on the record write and keeps empty availability replacement", async () => {
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
    accountEmail: null,
    availability: [],
    createdAt: new Date("2028-02-29T10:00:00Z")
  }
  const create: FieldOperationsRepository["createStaff"] = params => {
    expect(params.createAccount).toBe(true)
    expect(params.password).toBe("Clave1234")
    return of(Result.success(staff))
  }
  const availability: FieldOperationsRepository["replaceAvailability"] = (_id, params) => {
    expect(params.slots).toEqual([])
    return of(Result.success(staff))
  }
  for (const result of [
    await firstValueFrom(
      create({
        name: "S",
        document: "DOC-3",
        phone: null,
        email: "a@b.test",
        language: "es",
        joinedOn: null,
        createAccount: true,
        password: "Clave1234"
      })
    ),
    await firstValueFrom(availability(3, { slots: [] }))
  ]) {
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual(staff)
  }
  // The retired linking model leaves no member behind on the port.
  expectTypeOf<
    "linkStaffAccount" extends keyof FieldOperationsRepository ? true : false
  >().toEqualTypeOf<false>()
  expectTypeOf<
    "userId" extends keyof CreateFieldStaffParams | keyof UpdateFieldStaffParams ? true : false
  >().toEqualTypeOf<false>()
  expectTypeOf<CreateFieldStaffParams["createAccount"]>().toEqualTypeOf<boolean | undefined>()
  expectTypeOf<CreateFieldStaffParams["password"]>().toEqualTypeOf<string | null | undefined>()
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

it("keeps the account field rejection typed as a field operations error", () => {
  const failure = new StaffAccountFailure("EMAIL_RESERVED")
  expect(failure).toBeInstanceOf(FieldOperationsError)
  expect(failure.code).toBe("INVALID_DATA")
  expect(failure.reason).toBe("EMAIL_RESERVED")
  expect(failure.message).not.toContain("correo@")
  expectTypeOf(failure.reason).toEqualTypeOf<StaffAccountFailureReason>()
})
