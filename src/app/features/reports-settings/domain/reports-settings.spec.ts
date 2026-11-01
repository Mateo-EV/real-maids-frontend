import { describe, expect, it } from "vitest"
import { KpiDefinition } from "./entities/kpi-definition.entity"
import { KpiMeasurement } from "./entities/kpi-measurement.entity"
import { GeneratedReport } from "./entities/generated-report.entity"
import { SystemParameter } from "./entities/system-parameter.entity"
import { MigrationRecord } from "./entities/migration-record.entity"

const timestamp = new Date("2026-02-03T04:05:06Z")

describe("reports and settings schema factories", () => {
  it("preserves nullable and fully populated KPI definitions with exact decimals and open catalogs", () => {
    expect(KpiDefinition.create(1, "Completion", null, null, null, null, null, false)).toEqual({
      id: 1,
      name: "Completion",
      description: null,
      formula: null,
      unit: null,
      target: null,
      frequency: null,
      isActive: false
    })
    expect(
      KpiDefinition.create(
        2,
        "Revenue",
        "Description",
        "server formula",
        "USD",
        "99999999.99",
        "custom",
        true
      )
    ).toEqual({
      id: 2,
      name: "Revenue",
      description: "Description",
      formula: "server formula",
      unit: "USD",
      target: "99999999.99",
      frequency: "custom",
      isActive: true
    })
  })
  it("preserves calendar boundaries, decimal scale and calculation instant", () => {
    expect(KpiMeasurement.create(3, 2, "2024-02-29", "2024-03-31", "-0001.20", timestamp)).toEqual({
      id: 3,
      kpiId: 2,
      periodStart: "2024-02-29",
      periodEnd: "2024-03-31",
      value: "-0001.20",
      calculatedAt: timestamp
    })
  })
  it.each([null, "desde=2024-02-29"])("preserves report parameters %s and actor ID", parameters => {
    expect(GeneratedReport.create(4, 7, "CUSTOM", parameters, "CSV", timestamp)).toEqual({
      id: 4,
      userId: 7,
      type: "CUSTOM",
      parameters,
      format: "CSV",
      generatedAt: timestamp
    })
  })
  it.each([null, timestamp])("preserves nullable settings metadata %s", updatedAt => {
    expect(SystemParameter.create(5, "display-example", "value", null, updatedAt)).toEqual({
      id: 5,
      key: "display-example",
      value: "value",
      description: null,
      updatedAt
    })
    expect(SystemParameter.create(6, "display-example", "other", "Description", updatedAt)).toEqual(
      {
        id: 6,
        key: "display-example",
        value: "other",
        description: "Description",
        updatedAt
      }
    )
  })
  it.each([null, "Imported"])(
    "preserves migration history and nullable observation %s",
    observation => {
      expect(
        MigrationRecord.create(8, "customer", "legacy", "external-001", 9, observation, timestamp)
      ).toEqual({
        id: 8,
        entity: "customer",
        sourceSystem: "legacy",
        externalId: "external-001",
        internalId: 9,
        observation,
        migratedAt: timestamp
      })
    }
  )
})
