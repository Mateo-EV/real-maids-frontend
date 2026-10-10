import { Component, getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { of, Subject } from "rxjs"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { Result } from "@/app/shared/utils/result"
import { AUDIT_LOG_REPOSITORY } from "../../../domain/repositories/audit-log.repository"
import { AuditLogRepositoryImpl } from "../../../infrastructure/repositories/audit-log.repository-impl"
import { GetAuditLogByIdUseCase } from "../../../application/use-cases/get-audit-log-by-id.use-case"
import { AuditLog } from "../../../domain/entities/audit-log.entity"
import { AuditLogError } from "../../../domain/errors/audit-log.error"
import { AuditDetail, AuditDetailContext } from "./audit-detail"

@Component({ template: "" })
class TestHost {}
describe("Audit detail", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [{ provide: AUDIT_LOG_REPOSITORY, useExisting: AuditLogRepositoryImpl }]
    })
  })
  afterEach(() => vi.useRealTimers())
  async function setup(logId: number) {
    const fixture = TestBed.createComponent(TestHost)
    fixture.detectChanges()
    const ref = TestBed.inject(HlmDialogService).open<void, AuditDetailContext>(AuditDetail, {
      context: { logId },
      disableClose: true,
      showCloseButton: false
    })
    await vi.runAllTimersAsync()
    await fixture.whenStable()
    const element = document.querySelector<HTMLElement>("app-audit-detail")!
    const dialog = getDebugNode(element)!.injector.get(AuditDetail)
    return { fixture, ref, element, dialog }
  }
  it("shows exact selected metadata with no invented diff and uses shared titled header", async () => {
    const { element, dialog, ref } = await setup(1)
    expect(element.firstElementChild?.getAttribute("data-slot")).toBe("dialog-header")
    expect(element.querySelector('[data-slot="dialog-title"]')?.textContent).toContain("LOG-1")
    expect(element.textContent).toContain("USUARIO-001")
    expect(element.textContent).toContain("Fecha UTC")
    expect(element.querySelector("[data-audit-change]")).toBeNull()
    expect(element.textContent).toContain("no incluye valores antes/después")
    dialog.close()
    await vi.runAllTimersAsync()
    expect(ref.state()).toBe("closed")
  })
  it("renders only supplied before/after values for the selected record", async () => {
    const { element } = await setup(9)
    expect(element.textContent).toContain("ASIGNACION-009")
    expect(element.querySelectorAll("[data-audit-change]")).toHaveLength(1)
    expect(element.textContent).toContain("Equipo 9")
    expect(element.textContent).toContain("Equipo 10")
    expect(element.textContent).not.toMatch(/hash|inmutable|verificad/i)
  })
  it("shows typed unknown ID failure and supports retry", async () => {
    const { dialog, element } = await setup(999)
    expect(element.textContent).toContain("Registro no encontrado")
    vi.spyOn(TestBed.inject(GetAuditLogByIdUseCase), "execute").mockReturnValue(
      of(
        Result.success(
          AuditLog.create(999, 1, "usuario", "INSERT", "Demo", "192.0.2.1", new Date(0))
        )
      )
    )
    dialog.retry()
    TestBed.tick()
    expect(element.textContent).toContain("Demo")
    expect(element.querySelector('[role="alert"]')).toBeNull()
  })
  it("Escape closes during a pending read and cancels late results", async () => {
    const { dialog, ref, element } = await setup(999)
    const late = new Subject<Result<AuditLog, AuditLogError>>()
    const teardown = vi.fn()
    late.subscribe({ complete: teardown })
    vi.spyOn(TestBed.inject(GetAuditLogByIdUseCase), "execute").mockReturnValue(late)
    dialog.retry()
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
    )
    await vi.runAllTimersAsync()
    expect(ref.state()).toBe("closed")
    late.next(
      Result.success(AuditLog.create(999, 1, "usuario", "INSERT", "late", "192.0.2.1", new Date(0)))
    )
    expect(dialog.log()).toBeUndefined()
    expect(dialog.loading()).toBe(false)
  })
})
