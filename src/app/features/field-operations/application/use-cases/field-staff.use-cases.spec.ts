import { TestBed } from "@angular/core/testing"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { Result } from "@/app/shared/utils/result"
import { FieldOperationsError } from "../../domain/errors/field-operations.error"
import { EvidenceMoment } from "../../domain/entities/service-evidence.entity"
import { FIELD_OPERATIONS_REPOSITORY } from "../../domain/repositories/field-operations.repository"
import { provideFieldOperationsReads } from "../../field-operations.providers"
import { FieldStaffHttpSource } from "../../infrastructure/source/field-staff-http.source"
import { FieldOperationsRepositoryImpl } from "../../infrastructure/repositories/field-operations.repository-impl"
import {
  GetFieldStaffUseCase,
  GetFieldStaffByIdUseCase,
  GetMyStaffProfileUseCase
} from "./field-staff.use-cases"

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideFieldOperationsReads(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: "http://localhost:8080" }
    ]
  })
}
describe("Field operations root composition and application reads", () => {
  it("aliases the full repository to its root implementation, distinct from the shared root source", () => {
    setup()
    expect(TestBed.inject(FIELD_OPERATIONS_REPOSITORY)).toBe(
      TestBed.inject(FieldOperationsRepositoryImpl)
    )
    expect(TestBed.inject(FIELD_OPERATIONS_REPOSITORY)).not.toBe(
      TestBed.inject(FieldStaffHttpSource)
    )
  })
  it("propagates the exact source Result streams through stateless use cases and useExisting repository", () => {
    setup()
    const source = TestBed.inject(FieldStaffHttpSource)
    const response = of(Result.failure(new FieldOperationsError("FORBIDDEN", "Safe")))
    const list = vi.spyOn(source, "getStaff").mockReturnValue(response)
    const detail = vi.spyOn(source, "getStaffById").mockReturnValue(response)
    const me = vi.spyOn(source, "getMyStaffProfile").mockReturnValue(response)
    const q = { offset: 20, limit: 10, isActive: false, search: "Doc" }
    expect(TestBed.inject(GetFieldStaffUseCase).execute(q)).toBe(response)
    expect(list).toHaveBeenCalledExactlyOnceWith(q)
    expect(TestBed.inject(GetFieldStaffByIdUseCase).execute(7)).toBe(response)
    expect(detail).toHaveBeenCalledExactlyOnceWith(7)
    expect(TestBed.inject(GetMyStaffProfileUseCase).execute()).toBe(response)
    expect(me).toHaveBeenCalledExactlyOnceWith()
    response.subscribe(result =>
      expect(
        result.either(
          () => "unexpected",
          e => e.code
        )
      ).toBe("FORBIDDEN")
    )
  })
  it("propagates successful payloads and default query without transformation", () => {
    const profile = {
      id: 7,
      name: "Staff",
      document: "D",
      phone: null,
      email: null,
      language: "es",
      joinedOn: null,
      isActive: true,
      userId: 19,
      availability: [],
      createdAt: new Date("2026-01-01T00:00:00Z")
    }
    const page = Result.success({ items: [profile], total: 1, offset: 0, limit: 20 }),
      detail = Result.success(profile)
    const list = vi.fn(() => of(page))
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FIELD_OPERATIONS_REPOSITORY,
          useValue: {
            getStaff: list,
            getStaffById: () => of(detail),
            getMyStaffProfile: () => of(detail)
          }
        }
      ]
    })
    TestBed.inject(GetFieldStaffUseCase)
      .execute()
      .subscribe(r => expect(r).toBe(page))
    expect(list).toHaveBeenCalledExactlyOnceWith({})
    TestBed.inject(GetFieldStaffByIdUseCase)
      .execute(7)
      .subscribe(r => expect(r).toBe(detail))
    TestBed.inject(GetMyStaffProfileUseCase)
      .execute()
      .subscribe(r =>
        expect(
          r.either(
            v => v.id,
            () => 0
          )
        ).toBe(7)
      )
  })
  it("fails every unimplemented confirmed write and proposal explicitly, with zero HTTP", async () => {
    setup()
    const r = TestBed.inject(FIELD_OPERATIONS_REPOSITORY)
    const profile = {
      name: "Staff",
      document: "D",
      phone: null,
      email: null,
      language: "es",
      joinedOn: null
    }
    const crew = { name: "Crew", description: null, isActive: true }
    const member = { staffId: 7, role: "RESPONSABLE", isActive: true }
    const work = { staffId: 7, startedAt: new Date(), endedAt: null, observation: null }
    const evidence = {
      staffId: 7,
      fileUrl: "https://files.example.test/photo",
      moment: EvidenceMoment.Before,
      description: null
    }
    const requests = [
      r.createStaff(profile),
      r.updateStaff(7, profile),
      r.setStaffStatus(7, { isActive: false }),
      r.linkStaffAccount(7, { userId: null }),
      r.replaceAvailability(7, { slots: [] }),
      r.getCrews({}),
      r.getCrew(1),
      r.createCrew(crew),
      r.updateCrew(1, crew),
      r.getCrewMembers(1),
      r.createCrewMember(1, member),
      r.updateCrewMember(1, 2, member),
      r.getWorkLogs(1),
      r.createWorkLog(1, work),
      r.updateWorkLog(1, 2, work),
      r.getChecklist(1),
      r.createChecklistItem(1, { taskId: 1 }),
      r.updateChecklistItem(1, 2, { isCompleted: true, comment: null }),
      r.getEvidence(1),
      r.createEvidence(1, evidence),
      r.updateEvidence(1, 2, evidence)
    ]
    for (const request of requests)
      expect(await firstValueFrom<unknown>(request)).toMatchObject({
        success: false,
        error: { code: "UNSUPPORTED" }
      })
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
