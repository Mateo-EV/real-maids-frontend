import { describe, expect, it } from "vitest"
import { Quote } from "./entities/quote.entity"
import { QuoteLine } from "./entities/quote-line.entity"
import { ServiceContract } from "./entities/service-contract.entity"
import { ServiceRequest } from "./entities/service-request.entity"
import { OrderStatus } from "./entities/order-status.entity"
import { ServiceOrder } from "./entities/service-order.entity"
import { OrderStatusHistory } from "./entities/order-status-history.entity"
import { ReschedulingReason } from "./entities/rescheduling-reason.entity"
import { ServiceSchedule } from "./entities/service-schedule.entity"
import { ServiceAssignment } from "./entities/service-assignment.entity"

function factoryCase<A extends unknown[], E extends object>(
  name: string,
  create: (...args: A) => E,
  args: A,
  keys: readonly (keyof E)[],
  nullable: number[] = []
) {
  describe(name, () => {
    it("preserves every supplied field including decimal and date representations", () => {
      const entity = create(...args)
      expect(entity).toEqual(Object.fromEntries(keys.map((key, index) => [key, args[index]])))
      args.forEach((value, index) => {
        if (value instanceof Date) expect(entity[keys[index]]).toBe(value)
      })
    })
    if (nullable.length)
      it("preserves every SQL nullable field as null", () => {
        const values = args.map((value, index) => (nullable.includes(index) ? null : value)) as A
        expect(create(...values)).toEqual(
          Object.fromEntries(keys.map((key, index) => [key, values[index]]))
        )
      })
  })
}
const timestamp = new Date("2028-02-29T23:59:59.123Z")
factoryCase(
  "Quote",
  Quote.create,
  [
    21,
    31,
    32,
    33,
    34,
    "Q-2028-001",
    "00000001.10",
    "99999999.99",
    "custom-status",
    timestamp,
    "2028-02-29"
  ],
  [
    "id",
    "prospectId",
    "customerId",
    "propertyId",
    "userId",
    "number",
    "subtotal",
    "total",
    "status",
    "issuedAt",
    "validUntil"
  ],
  [1, 2, 3, 10]
)
factoryCase(
  "QuoteLine",
  QuoteLine.create,
  [22, 21, 41, 42, "Windows", 3, "12345678.90", "37037036.70"],
  [
    "id",
    "quoteId",
    "serviceTypeId",
    "additionalServiceId",
    "description",
    "quantity",
    "unitPrice",
    "subtotal"
  ],
  [2, 3, 4]
)
factoryCase(
  "ServiceContract",
  ServiceContract.create,
  [
    23,
    32,
    33,
    41,
    43,
    44,
    "C-2028-001",
    "custom-day",
    "09:30:00",
    "2028-02-29",
    "2029-02-28",
    false,
    timestamp,
    34
  ],
  [
    "id",
    "customerId",
    "propertyId",
    "serviceTypeId",
    "frequencyId",
    "rateId",
    "number",
    "preferredDay",
    "preferredTime",
    "validFrom",
    "validUntil",
    "isActive",
    "createdAt",
    "registeredByUserId"
  ],
  [7, 8, 10, 13]
)
factoryCase(
  "ServiceRequest",
  ServiceRequest.create,
  [24, 33, 41, 34, "Description", "2028-02-29", "future-status", timestamp, timestamp],
  [
    "id",
    "propertyId",
    "serviceTypeId",
    "userId",
    "description",
    "desiredDate",
    "status",
    "registeredAt",
    "updatedAt"
  ],
  [4, 5, 8]
)
factoryCase(
  "OrderStatus",
  OrderStatus.create,
  [25, "Custom status", 8, false],
  ["id", "name", "sortOrder", "isFinal"]
)
factoryCase(
  "ServiceOrder",
  ServiceOrder.create,
  [
    26,
    24,
    23,
    33,
    25,
    "OS-2028-001",
    "99999999.99",
    "Observation",
    "legacy",
    "ext-1",
    timestamp,
    timestamp,
    34
  ],
  [
    "id",
    "requestId",
    "contractId",
    "propertyId",
    "statusId",
    "code",
    "estimatedAmount",
    "observation",
    "sourceSystem",
    "externalId",
    "createdAt",
    "updatedAt",
    "registeredByUserId"
  ],
  [1, 2, 6, 7, 8, 9, 11, 12]
)
factoryCase(
  "OrderStatusHistory",
  OrderStatusHistory.create,
  [27, 26, 25, 34, "Observation", timestamp],
  ["id", "orderId", "statusId", "userId", "observation", "occurredAt"],
  [4]
)
factoryCase(
  "ReschedulingReason",
  ReschedulingReason.create,
  [28, "Custom reason", "Description", false],
  ["id", "name", "description", "isActive"],
  [2]
)
factoryCase(
  "ServiceSchedule",
  ServiceSchedule.create,
  [29, 26, 28, "2028-02-29", "23:00:00", "23:59:59", false, timestamp, 34],
  [
    "id",
    "orderId",
    "reasonId",
    "date",
    "startTime",
    "endTime",
    "isCurrent",
    "registeredAt",
    "registeredByUserId"
  ],
  [2, 5, 8]
)
factoryCase(
  "ServiceAssignment",
  ServiceAssignment.create,
  [30, 26, 51, 52, "custom-role", timestamp, 34],
  ["id", "orderId", "staffId", "crewId", "assignedRole", "assignedAt", "registeredByUserId"],
  [3, 6]
)
