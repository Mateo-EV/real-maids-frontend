import { describe, expect, it } from "vitest"
import { FieldStaff } from "./entities/field-staff.entity"
import { StaffAvailability } from "./entities/staff-availability.entity"
import { Crew } from "./entities/crew.entity"
import { CrewMember } from "./entities/crew-member.entity"
import { WorkLog } from "./entities/work-log.entity"
import { ServiceChecklist } from "./entities/service-checklist.entity"
import { ServiceEvidence, EvidenceMoment } from "./entities/service-evidence.entity"

function factoryCase<A extends unknown[], E extends object>(
  name: string,
  create: (...args: A) => E,
  args: A,
  keys: readonly (keyof E)[],
  nullable: number[] = []
) {
  describe(name, () => {
    it("preserves every supplied field and temporal representation", () => {
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
  "FieldStaff",
  FieldStaff.create,
  [
    51,
    61,
    "Staff name",
    "DOC-123",
    "+15555550101",
    "staff@example.test",
    "future-language",
    "2028-02-29",
    "legacy",
    "ext-1",
    false,
    timestamp
  ],
  [
    "id",
    "userId",
    "name",
    "document",
    "phone",
    "email",
    "language",
    "joinedOn",
    "sourceSystem",
    "externalId",
    "isActive",
    "createdAt"
  ],
  [1, 4, 5, 7, 8, 9]
)
factoryCase(
  "StaffAvailability",
  StaffAvailability.create,
  [52, 51, "custom-day", "08:15:00", "17:45:59", false],
  ["id", "staffId", "weekday", "startTime", "endTime", "isActive"]
)
factoryCase(
  "Crew",
  Crew.create,
  [53, "Crew name", "Description", false, timestamp],
  ["id", "name", "description", "isActive", "createdAt"],
  [2]
)
factoryCase(
  "CrewMember",
  CrewMember.create,
  [54, 53, 51, "custom-role", false],
  ["id", "crewId", "staffId", "role", "isActive"]
)
factoryCase(
  "WorkLog",
  WorkLog.create,
  [55, 71, 51, timestamp, timestamp, "Observation"],
  ["id", "orderId", "staffId", "startedAt", "endedAt", "observation"],
  [4, 5]
)
factoryCase(
  "ServiceChecklist",
  ServiceChecklist.create,
  [56, 71, 81, false, "Comment", timestamp],
  ["id", "orderId", "taskId", "isCompleted", "comment", "registeredAt"],
  [4, 5]
)
factoryCase(
  "ServiceEvidence",
  ServiceEvidence.create,
  [57, 71, 51, "/files/evidence.jpg", EvidenceMoment.Before, "Description", timestamp],
  ["id", "orderId", "staffId", "fileUrl", "moment", "description", "uploadedAt"],
  [2, 5]
)
it("retains both CHECK-constrained evidence wire values", () => {
  expect(EvidenceMoment.Before).toBe("antes")
  expect(EvidenceMoment.After).toBe("despues")
  expect(
    ServiceEvidence.create(58, 71, null, "/files/after.jpg", EvidenceMoment.After, null, timestamp)
      .moment
  ).toBe("despues")
})
