import { TestBed } from "@angular/core/testing"
import { InjectionToken } from "@angular/core"
import { of } from "rxjs"
import { describe, it, expect, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { CustomerError } from "../../domain/errors/customer.error"
import { CustomerType } from "../../domain/entities/customer.entity"
import { ACQUISITION_REPOSITORY } from "../../domain/repositories/acquisition.repository"
import { CUSTOMER_CAPABILITIES_REPOSITORY } from "../../domain/repositories/customer-capabilities.repository"
import { CUSTOMER_RELATIONS_REPOSITORY } from "../../domain/repositories/customer-relations.repository"
import { PROPERTY_REPOSITORY } from "../../domain/repositories/property.repository"
import { CUSTOMER_HISTORY_REPOSITORY } from "../../domain/repositories/customer-history.repository"
import { CUSTOMER_REPOSITORY } from "../../domain/repositories/customer.repository"
import * as acquisition from "./acquisition.use-cases"
import * as relations from "./customer-relations.use-cases"
import * as properties from "./property.use-cases"
import { SetCustomerStatusUseCase } from "./set-customer-status.use-case"
import { LinkCustomerAccountUseCase } from "./link-customer-account.use-case"
import { GetCustomerHistoryUseCase } from "./get-customer-history.use-case"
import { ListCustomersUseCase } from "./list-customers.use-case"
import { GetCustomerByIdUseCase } from "./get-customer-by-id.use-case"
import { CreateCustomerUseCase } from "./create-customer.use-case"
import { UpdateCustomerUseCase } from "./update-customer.use-case"

const origin = { name: "Origin", description: null, isActive: true }
const stage = { name: "Stage", order: 1, isFinal: false }
const lead = {
  originId: 1,
  stageId: 2,
  name: "Lead",
  email: null,
  phone: null,
  referenceAddress: null,
  observation: null
}
const follow = { leadId: 3, stageId: 2, comment: null }
const conversion = { leadId: 3, type: CustomerType.RESIDENTIAL }
const contact = {
  name: "Contact",
  position: null,
  email: null,
  phone: null,
  isPrimary: true,
  isActive: true
}
const preference = { propertyId: null, type: "Preference", detail: "Detail", isActive: true }
const property = {
  alias: null,
  address: "Address",
  city: null,
  region: null,
  postalCode: null,
  areaM2: null,
  roomCount: null,
  bathroomCount: null,
  accessInstructions: null,
  doorCode: null,
  hasPets: false
}
const profile = { name: "Customer", type: CustomerType.COMMERCIAL, email: null, phone: null }
interface Action {
  token: InjectionToken<unknown>
  method: string
  args: unknown[]
  invoke: () => unknown
}
const actions: Action[] = [
  {
    token: CUSTOMER_REPOSITORY,
    method: "findPage",
    args: [{}],
    invoke: () => TestBed.inject(ListCustomersUseCase).execute()
  },
  {
    token: CUSTOMER_REPOSITORY,
    method: "findById",
    args: [7],
    invoke: () => TestBed.inject(GetCustomerByIdUseCase).execute(7)
  },
  {
    token: CUSTOMER_REPOSITORY,
    method: "create",
    args: [profile],
    invoke: () => TestBed.inject(CreateCustomerUseCase).execute(profile)
  },
  {
    token: CUSTOMER_REPOSITORY,
    method: "update",
    args: [{ id: 7, ...profile }],
    invoke: () => TestBed.inject(UpdateCustomerUseCase).execute({ id: 7, ...profile })
  },
  {
    token: ACQUISITION_REPOSITORY,
    method: "listOrigins",
    args: [],
    invoke: () => TestBed.inject(acquisition.ListLeadOriginsUseCase).execute()
  },
  {
    token: ACQUISITION_REPOSITORY,
    method: "createOrigin",
    args: [origin],
    invoke: () => TestBed.inject(acquisition.CreateLeadOriginUseCase).execute(origin)
  },
  {
    token: ACQUISITION_REPOSITORY,
    method: "updateOrigin",
    args: [{ id: 1, ...origin }],
    invoke: () => TestBed.inject(acquisition.UpdateLeadOriginUseCase).execute({ id: 1, ...origin })
  },
  {
    token: ACQUISITION_REPOSITORY,
    method: "listStages",
    args: [],
    invoke: () => TestBed.inject(acquisition.ListFunnelStagesUseCase).execute()
  },
  {
    token: ACQUISITION_REPOSITORY,
    method: "createStage",
    args: [stage],
    invoke: () => TestBed.inject(acquisition.CreateFunnelStageUseCase).execute(stage)
  },
  {
    token: ACQUISITION_REPOSITORY,
    method: "updateStage",
    args: [{ id: 2, ...stage }],
    invoke: () => TestBed.inject(acquisition.UpdateFunnelStageUseCase).execute({ id: 2, ...stage })
  },
  {
    token: ACQUISITION_REPOSITORY,
    method: "listLeads",
    args: [{ offset: 20, limit: 10 }],
    invoke: () => TestBed.inject(acquisition.ListLeadsUseCase).execute({ offset: 20, limit: 10 })
  },
  {
    token: ACQUISITION_REPOSITORY,
    method: "findLead",
    args: [3],
    invoke: () => TestBed.inject(acquisition.GetLeadUseCase).execute(3)
  },
  {
    token: ACQUISITION_REPOSITORY,
    method: "createLead",
    args: [lead],
    invoke: () => TestBed.inject(acquisition.CreateLeadUseCase).execute(lead)
  },
  {
    token: ACQUISITION_REPOSITORY,
    method: "updateLead",
    args: [{ id: 3, ...lead }],
    invoke: () => TestBed.inject(acquisition.UpdateLeadUseCase).execute({ id: 3, ...lead })
  },
  {
    token: ACQUISITION_REPOSITORY,
    method: "listFollowUps",
    args: [3],
    invoke: () => TestBed.inject(acquisition.ListLeadFollowUpsUseCase).execute(3)
  },
  {
    token: ACQUISITION_REPOSITORY,
    method: "addFollowUp",
    args: [follow],
    invoke: () => TestBed.inject(acquisition.AddLeadFollowUpUseCase).execute(follow)
  },
  {
    token: ACQUISITION_REPOSITORY,
    method: "convertLead",
    args: [conversion],
    invoke: () => TestBed.inject(acquisition.ConvertLeadUseCase).execute(conversion)
  },
  {
    token: CUSTOMER_CAPABILITIES_REPOSITORY,
    method: "setStatus",
    args: [{ customerId: 7, isActive: false }],
    invoke: () =>
      TestBed.inject(SetCustomerStatusUseCase).execute({ customerId: 7, isActive: false })
  },
  {
    token: CUSTOMER_CAPABILITIES_REPOSITORY,
    method: "linkAccount",
    args: [{ customerId: 7, userId: null }],
    invoke: () =>
      TestBed.inject(LinkCustomerAccountUseCase).execute({ customerId: 7, userId: null })
  },
  {
    token: CUSTOMER_RELATIONS_REPOSITORY,
    method: "listContacts",
    args: [7],
    invoke: () => TestBed.inject(relations.ListCustomerContactsUseCase).execute(7)
  },
  {
    token: CUSTOMER_RELATIONS_REPOSITORY,
    method: "createContact",
    args: [7, contact],
    invoke: () => TestBed.inject(relations.CreateCustomerContactUseCase).execute(7, contact)
  },
  {
    token: CUSTOMER_RELATIONS_REPOSITORY,
    method: "updateContact",
    args: [7, { id: 4, ...contact }],
    invoke: () =>
      TestBed.inject(relations.UpdateCustomerContactUseCase).execute(7, { id: 4, ...contact })
  },
  {
    token: CUSTOMER_RELATIONS_REPOSITORY,
    method: "listPreferences",
    args: [7],
    invoke: () => TestBed.inject(relations.ListCustomerPreferencesUseCase).execute(7)
  },
  {
    token: CUSTOMER_RELATIONS_REPOSITORY,
    method: "createPreference",
    args: [7, preference],
    invoke: () => TestBed.inject(relations.CreateCustomerPreferenceUseCase).execute(7, preference)
  },
  {
    token: CUSTOMER_RELATIONS_REPOSITORY,
    method: "updatePreference",
    args: [7, { id: 5, ...preference }],
    invoke: () =>
      TestBed.inject(relations.UpdateCustomerPreferenceUseCase).execute(7, { id: 5, ...preference })
  },
  {
    token: PROPERTY_REPOSITORY,
    method: "findByCustomer",
    args: [7],
    invoke: () => TestBed.inject(properties.ListCustomerPropertiesUseCase).execute(7)
  },
  {
    token: PROPERTY_REPOSITORY,
    method: "create",
    args: [7, property],
    invoke: () => TestBed.inject(properties.CreatePropertyUseCase).execute(7, property)
  },
  {
    token: PROPERTY_REPOSITORY,
    method: "update",
    args: [7, { id: 6, ...property }],
    invoke: () =>
      TestBed.inject(properties.UpdatePropertyUseCase).execute(7, { id: 6, ...property })
  },
  {
    token: PROPERTY_REPOSITORY,
    method: "setStatus",
    args: [7, 6, false],
    invoke: () => TestBed.inject(properties.SetPropertyStatusUseCase).execute(7, 6, false)
  },
  {
    token: CUSTOMER_HISTORY_REPOSITORY,
    method: "getHistory",
    args: [7, 5],
    invoke: () => TestBed.inject(GetCustomerHistoryUseCase).execute(7, 5)
  }
]
describe("Every stateless customer application action", () => {
  for (const action of actions) {
    it(`${action.token.toString()}.${action.method} delegates arguments and returns unchanged success/failure streams`, () => {
      // Opaque marker proves delegation never fabricates or remaps a repository result.
      const success = of(Result.success({ verifiedByRepository: true }))
      const failure = of(Result.failure(new CustomerError("FORBIDDEN")))
      const method = vi.fn().mockReturnValueOnce(success).mockReturnValueOnce(failure)
      TestBed.configureTestingModule({
        providers: [{ provide: action.token, useValue: { [action.method]: method } }]
      })
      expect(action.invoke()).toBe(success)
      expect(action.invoke()).toBe(failure)
      expect(method).toHaveBeenNthCalledWith(1, ...action.args)
      expect(method).toHaveBeenNthCalledWith(2, ...action.args)
    })
  }
})
