import { TestBed } from "@angular/core/testing"
import { describe, it, expect, vi } from "vitest"
import { of } from "rxjs"
import { appConfig } from "@/app/core/config/app.config"
import { Result } from "@/app/shared/utils/result"
import { CustomerError } from "../../domain/errors/customer.error"
import { ACQUISITION_REPOSITORY } from "../../domain/repositories/acquisition.repository"
import { CUSTOMER_CAPABILITIES_REPOSITORY } from "../../domain/repositories/customer-capabilities.repository"
import { CUSTOMER_RELATIONS_REPOSITORY } from "../../domain/repositories/customer-relations.repository"
import { PROPERTY_REPOSITORY } from "../../domain/repositories/property.repository"
import { CUSTOMER_HISTORY_REPOSITORY } from "../../domain/repositories/customer-history.repository"
import { AcquisitionHttpSource } from "../source/acquisition-http.source"
import { CustomerHttpSource } from "../source/customer-http.source"
import { CustomerRelationsHttpSource } from "../source/customer-relations-http.source"
import { PropertyHttpSource } from "../source/property-http.source"
import { CustomerHistoryHttpSource } from "../source/customer-history-http.source"
import { AcquisitionRepositoryImpl } from "./acquisition.repository-impl"
import { CustomerCapabilitiesRepositoryImpl } from "./customer-capabilities.repository-impl"
import { CustomerRelationsRepositoryImpl } from "./customer-relations.repository-impl"
import { PropertyRepositoryImpl } from "./property.repository-impl"
import { CustomerHistoryRepositoryImpl } from "./customer-history.repository-impl"

describe("Customer composition root", () => {
  it("aliases every capability token to its distinct root implementation, never a source", () => {
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const bindings = [
      [
        TestBed.inject(ACQUISITION_REPOSITORY),
        TestBed.inject(AcquisitionRepositoryImpl),
        TestBed.inject(AcquisitionHttpSource)
      ],
      [
        TestBed.inject(CUSTOMER_CAPABILITIES_REPOSITORY),
        TestBed.inject(CustomerCapabilitiesRepositoryImpl),
        TestBed.inject(CustomerHttpSource)
      ],
      [
        TestBed.inject(CUSTOMER_RELATIONS_REPOSITORY),
        TestBed.inject(CustomerRelationsRepositoryImpl),
        TestBed.inject(CustomerRelationsHttpSource)
      ],
      [
        TestBed.inject(PROPERTY_REPOSITORY),
        TestBed.inject(PropertyRepositoryImpl),
        TestBed.inject(PropertyHttpSource)
      ],
      [
        TestBed.inject(CUSTOMER_HISTORY_REPOSITORY),
        TestBed.inject(CustomerHistoryRepositoryImpl),
        TestBed.inject(CustomerHistoryHttpSource)
      ]
    ]
    for (const [bound, impl, source] of bindings) {
      expect(bound).toBe(impl)
      expect(bound).not.toBe(source)
    }
    expect(new Set(bindings.map(([bound]) => bound)).size).toBe(5)
  })
  it("delegates each capability through the shared HTTP source, preserving failures", () => {
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const response = of(Result.failure(new CustomerError("FORBIDDEN")))
    const acquisition = vi
      .spyOn(TestBed.inject(AcquisitionHttpSource), "listLeads")
      .mockReturnValue(response)
    const status = vi
      .spyOn(TestBed.inject(CustomerHttpSource), "setStatus")
      .mockReturnValue(response)
    const contacts = vi
      .spyOn(TestBed.inject(CustomerRelationsHttpSource), "listContacts")
      .mockReturnValue(response)
    const properties = vi
      .spyOn(TestBed.inject(PropertyHttpSource), "setStatus")
      .mockReturnValue(response)
    const history = vi
      .spyOn(TestBed.inject(CustomerHistoryHttpSource), "getHistory")
      .mockReturnValue(response)
    const page = { offset: 20, limit: 10 },
      desired = { customerId: 7, isActive: false }
    expect(TestBed.inject(ACQUISITION_REPOSITORY).listLeads(page)).toBe(response)
    expect(acquisition).toHaveBeenCalledExactlyOnceWith(page)
    expect(TestBed.inject(CUSTOMER_CAPABILITIES_REPOSITORY).setStatus(desired)).toBe(response)
    expect(status).toHaveBeenCalledExactlyOnceWith(desired)
    expect(TestBed.inject(CUSTOMER_RELATIONS_REPOSITORY).listContacts(7)).toBe(response)
    expect(contacts).toHaveBeenCalledExactlyOnceWith(7)
    expect(TestBed.inject(PROPERTY_REPOSITORY).setStatus(7, 6, false)).toBe(response)
    expect(properties).toHaveBeenCalledExactlyOnceWith(7, 6, false)
    expect(TestBed.inject(CUSTOMER_HISTORY_REPOSITORY).getHistory(7, 5)).toBe(response)
    expect(history).toHaveBeenCalledExactlyOnceWith(7, 5)
  })
})
