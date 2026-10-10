import { provideRouter } from "@angular/router"
import { TestBed } from "@angular/core/testing"
import { of, Subject } from "rxjs"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { AUDIT_LOG_REPOSITORY } from "../../../domain/repositories/audit-log.repository"
import { AuditLogRepositoryImpl } from "../../../infrastructure/repositories/audit-log.repository-impl"
import { GetAuditLogsUseCase } from "../../../application/use-cases/get-audit-logs.use-case"
import { ExportAuditLogsUseCase } from "../../../application/use-cases/export-audit-logs.use-case"
import { AuditLogError } from "../../../domain/errors/audit-log.error"
import { AuditCsvDownload } from "../../../infrastructure/export/audit-csv-download"
import { AuditLogsStore } from "../../state/audit-logs.store"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { AuditViewer } from "./audit-viewer"

describe("Audit viewer", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  function setup() {
    const download = vi.fn((_csv: string) => Result.success(undefined)),
      success = vi.fn()
    TestBed.configureTestingModule({
      imports: [AuditViewer],
      providers: [
        provideRouter([]),
        { provide: AUDIT_LOG_REPOSITORY, useExisting: AuditLogRepositoryImpl },
        { provide: AuditCsvDownload, useValue: { download } },
        { provide: HotToastService, useValue: { success } }
      ]
    })
    const fixture = TestBed.createComponent(AuditViewer)
    fixture.detectChanges()
    return {
      fixture,
      viewer: fixture.componentInstance,
      element: fixture.nativeElement as HTMLElement,
      download,
      success
    }
  }
  async function settle(fixture: ReturnType<typeof setup>["fixture"]) {
    await vi.advanceTimersByTimeAsync(250)
    fixture.detectChanges()
  }
  it("loads rows, reuses filter contract, combines filters before pagination and resets page", async () => {
    const { fixture, viewer, element } = setup()
    expect(element.textContent).toContain("Cargando")
    await settle(fixture)
    expect(element.querySelectorAll("tr[data-audit-row]")).toHaveLength(5)
    expect(element.querySelector(".catalog-filter-row #audit-day")).not.toBeNull()
    viewer.goToPage(2)
    await settle(fixture)
    expect(viewer.page()).toBe(2)
    const date = element.querySelector<HTMLInputElement>("#audit-day")!
    date.value = "2026-09-01"
    date.dispatchEvent(new Event("input"))
    const entity = element.querySelector<HTMLSelectElement>("#audit-entity")!
    entity.value = "usuario"
    entity.dispatchEvent(new Event("change"))
    await settle(fixture)
    expect(viewer.page()).toBe(1)
    expect(element.textContent).toContain("de 6 registros")
    viewer.setAction("LOGIN_SUCCESS")
    await settle(fixture)
    expect(element.textContent).toContain("Sin resultados")
    viewer.clearFilters()
    await settle(fixture)
    expect(element.textContent).toContain("de 48 registros")
  })
  it("retains labeled header controls, scoped UTC columns and readable desktop/mobile event metadata", async () => {
    const { fixture, element } = setup()
    await settle(fixture)
    const header = element.querySelector("#audit-title")!.parentElement!.parentElement!
    for (const id of ["audit-day", "audit-entity", "audit-action"]) {
      expect(header.querySelector(`label[for="${id}"]`)).not.toBeNull()
      expect(header.querySelector(`.catalog-filter-row #${id}`)).not.toBeNull()
    }
    expect(header.querySelector("[data-audit-export]")).not.toBeNull()
    const headings = element.querySelectorAll("thead th[scope='col']")
    expect(headings).toHaveLength(7)
    expect(headings[0].textContent).toContain("Timestamp (UTC)")
    const row = element.querySelector("[data-audit-row]")!
    expect(row.querySelectorAll("td.font-mono")).toHaveLength(4)
    expect(row.querySelector("[hlmBadge]")?.textContent?.trim()).not.toBe("")
    expect(element.querySelectorAll("[data-audit-card]")).toHaveLength(5)
  })
  it("shows retryable filter failures, then clamps a shrinking page and cancels reads on destroy", async () => {
    const { fixture, viewer, element } = setup()
    await settle(fixture)
    viewer.setDay("2026-02-30")
    await settle(fixture)
    expect(element.querySelector('[role="alert"]')?.textContent).toContain("Filtros no válidos")
    viewer.clearFilters()
    await settle(fixture)
    viewer.goToPage(2)
    await settle(fixture)
    const query = TestBed.inject(GetAuditLogsUseCase)
    const execute = vi
      .spyOn(query, "execute")
      .mockReturnValue(of(Result.success({ items: [], total: 1, offset: 5, limit: 5 })))
    viewer.retry()
    expect(viewer.page()).toBe(1)
    expect(execute).toHaveBeenLastCalledWith({ offset: 0, limit: 5 })
    const pending = new Subject<Result<never, AuditLogError>>()
    execute.mockReturnValue(pending)
    viewer.retry()
    expect(TestBed.inject(AuditLogsStore).loading()).toBe(true)
    fixture.destroy()
    expect(pending.observed).toBe(false)
    expect(TestBed.inject(AuditLogsStore).loading()).toBe(false)
  })

  it("does not report success when browser initiation fails", async () => {
    const { fixture, viewer, success } = setup()
    await settle(fixture)
    vi.spyOn(TestBed.inject(AuditCsvDownload), "download").mockReturnValue(
      Result.failure(new AuditLogError("DOWNLOAD_FAILED"))
    )
    viewer.exportCsv()
    await settle(fixture)
    expect(success).not.toHaveBeenCalled()
    expect(viewer.exportError()).toContain("No se pudo iniciar")
    expect(viewer.exporting()).toBe(false)
  })

  it("opens the selected log, not a static global detail", async () => {
    const { fixture, element } = setup()
    await settle(fixture)
    const open = vi.spyOn(TestBed.inject(HlmDialogService), "open").mockReturnValue({} as never)
    element.querySelector<HTMLButtonElement>("[data-audit-detail]")!.click()
    expect(open.mock.calls[0][1]?.context).toMatchObject({ logId: 48 })
  })
  it("exports all filtered records, blocks duplicates and confirms only after initiation", async () => {
    const { fixture, viewer, download, success } = setup()
    await settle(fixture)
    viewer.exportCsv()
    viewer.exportCsv()
    expect(viewer.exporting()).toBe(true)
    expect(download).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
    await settle(fixture)
    expect(download.mock.calls[0][0].split("\r\n")).toHaveLength(49)
    expect(download).toHaveBeenCalledOnce()
    expect(success).toHaveBeenCalledExactlyOnceWith("Descarga de auditoría iniciada")
  })
  it("keeps retryable query/export errors and suppresses late downloads after destruction", async () => {
    const { fixture, viewer, download, success } = setup()
    await settle(fixture)
    const exporter = TestBed.inject(ExportAuditLogsUseCase)
    vi.spyOn(exporter, "execute").mockReturnValueOnce(
      of(Result.failure(new AuditLogError("INVALID_FILTER")))
    )
    viewer.exportCsv()
    expect(viewer.exportError()).toContain("Filtros")
    const late = new Subject<Result<string, AuditLogError>>()
    vi.spyOn(exporter, "execute").mockReturnValue(late)
    viewer.exportCsv()
    fixture.destroy()
    late.next(Result.success("csv"))
    expect(download).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
    expect(TestBed.inject(AuditLogsStore).loading()).toBe(false)
  })
})
