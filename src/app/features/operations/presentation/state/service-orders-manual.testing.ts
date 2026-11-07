import { TestBed } from "@angular/core/testing"
import { vi } from "vitest"
import { ScheduleServiceOrderUseCase } from "../../application/use-cases/service-order-write.use-cases"
import { ReplaceServiceAssignmentsUseCase } from "../../application/use-cases/replace-service-assignments.use-case"
import { ServiceOrderSummary } from "../../domain/models/operations-read.models"
import {
  ScheduleServiceOrderParams,
  ReplaceServiceAssignmentsParams
} from "../../domain/params/operations.params"
import { createOrderHarness } from "./service-orders-create.store.testing"
import { ControlledOrderReads } from "./service-orders.store.testing"

export const scheduleInput = (): ScheduleServiceOrderParams => ({
  date: "2024-02-29",
  startTime: "08:15:00.123456789",
  endTime: null,
  reasonId: null
})
export const teamInput = (): ReplaceServiceAssignmentsParams => ({
  assignments: [
    { staffId: 21, role: "RESPONSABLE" },
    { staffId: 22, role: "APOYO" }
  ]
})
export function manualHarness() {
  const base = createOrderHarness()
  const schedules = new ControlledOrderReads<
    { id: number; params: ScheduleServiceOrderParams },
    ServiceOrderSummary
  >()
  const teams = new ControlledOrderReads<
    { id: number; params: ReplaceServiceAssignmentsParams },
    ServiceOrderSummary
  >()
  const scheduleExecute = vi.fn((id: number, params: ScheduleServiceOrderParams) =>
    schedules.execute({ id, params })
  )
  const teamExecute = vi.fn((id: number, params: ReplaceServiceAssignmentsParams) =>
    teams.execute({ id, params })
  )
  const scheduleFactory = vi.fn(() => ({ execute: scheduleExecute }))
  const teamFactory = vi.fn(() => ({ execute: teamExecute }))
  TestBed.configureTestingModule({
    providers: [
      { provide: ScheduleServiceOrderUseCase, useFactory: scheduleFactory },
      { provide: ReplaceServiceAssignmentsUseCase, useFactory: teamFactory }
    ]
  })
  return { ...base, schedules, teams, scheduleExecute, teamExecute, scheduleFactory, teamFactory }
}
