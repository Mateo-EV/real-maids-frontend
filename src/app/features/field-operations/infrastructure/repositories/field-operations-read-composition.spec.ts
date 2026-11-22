import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { FIELD_OPERATIONS_REPOSITORY } from "../../domain/repositories/field-operations.repository"
import { provideFieldOperationsReads } from "../../field-operations.providers"
import { FieldStaffHttpSource } from "../source/field-staff-http.source"
import { FieldOperationsRepositoryImpl } from "./field-operations.repository-impl"

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideFieldOperationsReads(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: "http://localhost:8080" }
    ]
  })
  return {
    repository: TestBed.inject(FIELD_OPERATIONS_REPOSITORY),
    impl: TestBed.inject(FieldOperationsRepositoryImpl),
    source: TestBed.inject(FieldStaffHttpSource),
    http: TestBed.inject(HttpTestingController)
  }
}

afterEach(() => TestBed.inject(HttpTestingController).verify())

describe("field operations root composition", () => {
  it("keeps the linked-staff write on the shared root source, not on a second adapter", () => {
    const app = setup()
    expect(app.repository).toBe(app.impl)
    expect(app.repository).not.toBe(app.source)
  })

  it("wires the account link while the other staff writes keep the shared stub", () => {
    const app = setup()
    expect(app.repository).toBe(app.impl)
    expect(app.repository).not.toBe(app.source)
    // The delegation itself is pinned by the use-case spec; here only the wiring differs.
    expect(app.repository.linkStaffAccount).not.toBe(app.repository.createStaff)
    expect(app.repository.createStaff).toBe(app.repository.setStaffStatus)
    expect(app.repository.setStaffStatus).toBe(app.repository.replaceAvailability)
  })

  it("keeps every remaining unwired write and proposal explicitly unsupported without HTTP", async () => {
    const app = setup()
    const staff = {
      name: "S",
      document: "D",
      phone: null,
      email: null,
      language: "es",
      joinedOn: null
    }
    const requests = [
      app.repository.createStaff(staff),
      app.repository.updateStaff(7, staff),
      app.repository.setStaffStatus(7, { isActive: false }),
      app.repository.replaceAvailability(7, { slots: [] }),
      app.repository.getCrews({}),
      app.repository.createCrew({ name: "C", description: null, isActive: true })
    ]
    for (const request of requests)
      expect(await firstValueFrom<unknown>(request)).toMatchObject({
        success: false,
        error: { code: "UNSUPPORTED" }
      })
    app.http.expectNone(() => true)
  })
})
