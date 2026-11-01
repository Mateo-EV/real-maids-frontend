import { describe, expect, it } from "vitest"
import { ServiceCategory } from "./entities/service-category.entity"
import { ServiceType } from "./entities/service-type.entity"
import { ServiceFrequency } from "./entities/service-frequency.entity"
import { ServiceRate } from "./entities/service-rate.entity"
import { AdditionalService } from "./entities/additional-service.entity"
import { ServiceTask } from "./entities/service-task.entity"

function factoryCase<A extends unknown[], E extends object>(
  name: string,
  create: (...args: A) => E,
  args: A,
  keys: readonly (keyof E)[],
  nullable: number[] = []
) {
  describe(name, () => {
    it("preserves every supplied field without coercion", () => {
      expect(create(...args)).toEqual(
        Object.fromEntries(keys.map((key, index) => [key, args[index]]))
      )
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

factoryCase(
  "ServiceCategory",
  ServiceCategory.create,
  [12, "Specialized", "Description", false],
  ["id", "name", "description", "isActive"],
  [2]
)
factoryCase(
  "ServiceType",
  ServiceType.create,
  [13, 12, "Deep clean", "Full service", 125, false],
  ["id", "categoryId", "name", "description", "estimatedDurationMinutes", "isActive"],
  [3]
)
factoryCase(
  "ServiceFrequency",
  ServiceFrequency.create,
  [14, "Custom interval", 17, false],
  ["id", "name", "intervalDays", "isActive"]
)
factoryCase(
  "ServiceRate",
  ServiceRate.create,
  [15, 13, 14, "99999999.99", "USD", "2028-02-29", "2028-12-31", false],
  [
    "id",
    "serviceTypeId",
    "frequencyId",
    "price",
    "currency",
    "validFrom",
    "validUntil",
    "isActive"
  ],
  [2, 6]
)
factoryCase(
  "AdditionalService",
  AdditionalService.create,
  [16, "Windows", "Interior", "00001234.50", 35, false],
  ["id", "name", "description", "price", "extraDurationMinutes", "isActive"],
  [2, 4]
)
factoryCase(
  "ServiceTask",
  ServiceTask.create,
  [17, 13, "Wash windows", 4, false],
  ["id", "serviceTypeId", "description", "sortOrder", "isRequired"]
)
