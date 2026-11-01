import { Injector } from "@angular/core"
import { firstValueFrom, Observable, of } from "rxjs"
import { describe, expect, expectTypeOf, it } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { ReportsSettingsError } from "./errors/reports-settings.error"
import {
  CreateKpiDefinitionParams,
  UpdateKpiDefinitionParams,
  PublicParameterQuery
} from "./params/reports-settings.params"
import {
  REPORTS_SETTINGS_REPOSITORY,
  ReportsSettingsRepository
} from "./repositories/reports-settings.repository"

describe("reports/settings domain boundary", () => {
  it("resolves a substitutable repository with confirmed and proposed operations and typed failures", async () => {
    const error = new ReportsSettingsError("FORBIDDEN")
    const failure = () => of(Result.failure(error))
    const types = [{ type: "CLIENTES", title: "Clients", description: "Activity" }]
    const repository: ReportsSettingsRepository = {
      getReportTypes: () => of(Result.success(types)),
      generateReport: failure,
      exportReportCsv: failure,
      getGeneratedReports: failure,
      getDashboard: failure,
      getKpiDefinitions: failure,
      createKpiDefinition: failure,
      updateKpiDefinition: failure,
      getKpiMeasurements: failure,
      getPublicParameters: failure,
      getMigrationHistory: failure
    }
    const injector = Injector.create({
      providers: [{ provide: REPORTS_SETTINGS_REPOSITORY, useValue: repository }]
    })
    const resolved = injector.get(REPORTS_SETTINGS_REPOSITORY)
    expect(resolved).toBe(repository)
    expect(await firstValueFrom(resolved.getReportTypes())).toEqual(Result.success(types))
    const definition: CreateKpiDefinitionParams = {
      name: "Revenue",
      description: null,
      formula: null,
      unit: null,
      target: "100.00",
      frequency: null,
      isActive: false
    }
    const operations: Observable<unknown>[] = [
      resolved.generateReport({ type: "CLIENTES", from: "2024-02-29" }),
      resolved.exportReportCsv({ type: "CLIENTES" }),
      resolved.getGeneratedReports({ offset: 0, limit: 10 }),
      resolved.getDashboard({}),
      resolved.getKpiDefinitions(),
      resolved.createKpiDefinition(definition),
      resolved.updateKpiDefinition(1, { target: null }),
      resolved.getKpiMeasurements(1, { periodStart: "2024-02-29" }),
      resolved.getPublicParameters({ keys: ["public-display-example"] }),
      resolved.getMigrationHistory({ entity: "customer" })
    ]
    for (const operation of operations)
      expect(await firstValueFrom(operation)).toEqual(Result.failure(error))
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("ReportsSettingsError")
    expect(error.code).toBe("FORBIDDEN")
    expect(error.message).toBe("Reports or settings operation failed")
    expect(new ReportsSettingsError("VALIDATION", "Safe validation").message).toBe(
      "Safe validation"
    )
  })

  it("has nullable decimal patches, no generated KPI metadata and read-only settings/migration contracts", () => {
    expectTypeOf<UpdateKpiDefinitionParams["target"]>().toEqualTypeOf<string | null | undefined>()
    expectTypeOf<
      Extract<keyof CreateKpiDefinitionParams, "id" | "createdAt" | "updatedAt">
    >().toEqualTypeOf<never>()
    expectTypeOf<keyof PublicParameterQuery>().toEqualTypeOf<"keys">()
    expectTypeOf<
      Extract<
        keyof ReportsSettingsRepository,
        "createMigration" | "updateMigration" | "updateSystemParameter"
      >
    >().toEqualTypeOf<never>()
  })
})
