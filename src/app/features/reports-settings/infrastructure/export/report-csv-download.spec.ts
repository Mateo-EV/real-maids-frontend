import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReportCsvFile } from "../../domain/models/report.models"
import { REPORT_DOWNLOAD_RUNTIME, ReportCsvDownload } from "./report-csv-download"

const csv = () => new Blob([" Cliente,Servicios\nAna,3\n"], { type: "text/csv" })
const file = (fileName: string | null = null): ReportCsvFile => ({ bytes: csv(), fileName })

function setup(server = false) {
  const clicks: string[] = []
  const runtime = {
    createURL: vi.fn((_blob: Blob) => "blob:report-csv"),
    revokeURL: vi.fn((_url: string) => undefined),
    click: vi.fn((anchor: HTMLAnchorElement) => {
      clicks.push(anchor.getAttribute("download") ?? "")
    })
  }
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: server ? "server" : "browser" },
      { provide: REPORT_DOWNLOAD_RUNTIME, useValue: runtime }
    ]
  })
  return { adapter: TestBed.inject(ReportCsvDownload), runtime, clicks }
}

afterEach(() => TestBed.resetTestingModule())

// W7: the browser download is started from the received bytes with a safe name.
describe("Report CSV browser download", () => {
  it("uses the supplied filename and revokes the object URL", () => {
    const { adapter, runtime } = setup()
    const kept = csv()
    const result = adapter.download(
      { bytes: kept, fileName: "clientes-2026-01.csv" },
      {
        type: "CLIENTES",
        from: "2026-01-01",
        to: "2026-01-31"
      }
    )
    expect(result.success).toBe(true)
    // Supplies exactly the received bytes; nothing is re-encoded or rebuilt.
    expect(runtime.createURL).toHaveBeenCalledExactlyOnceWith(kept)
    expect(runtime.revokeURL).toHaveBeenCalledExactlyOnceWith("blob:report-csv")
    // Best-effort DOM cleanup: the temporary anchor does not stay in the document.
    expect(document.querySelector('a[download="clientes-2026-01.csv"]')).toBeNull()
  })

  it("derives a safe human-readable name from the type and period when the server sends none", () => {
    const { adapter, runtime } = setup()
    const names: string[] = []
    runtime.click.mockImplementation((anchor: HTMLAnchorElement) => {
      names.push(anchor.download)
    })
    const cases: {
      fileName: string | null
      params: Parameters<ReportCsvDownload["download"]>[1]
    }[] = [
      { fileName: null, params: { type: "CLIENTES", from: "2026-01-01", to: "2026-01-31" } },
      { fileName: "", params: { type: "CLIENTES", from: "2026-01-01" } },
      { fileName: null, params: { type: "CLIENTES", to: "2026-01-31" } },
      { fileName: null, params: { type: "CLIENTES" } },
      // A supplied name is never trusted as a path or a hidden file.
      { fileName: "../../etc/passwd", params: { type: "CLIENTES" } },
      { fileName: "C:\\temp\\clientes.csv", params: { type: "CLIENTES" } },
      { fileName: "clientes", params: { type: "CLIENTES" } }
    ]
    for (const item of cases)
      expect(adapter.download(file(item.fileName), item.params).success).toBe(true)
    expect(names).toEqual([
      "clientes-2026-01-01-a-2026-01-31.csv",
      "clientes-desde-2026-01-01.csv",
      "clientes-hasta-2026-01-31.csv",
      "clientes.csv",
      "etc-passwd.csv",
      "C-temp-clientes.csv",
      "clientes.csv"
    ])
    for (const name of names) {
      expect(name).not.toContain("/")
      expect(name).not.toContain("\\")
      expect(name.endsWith(".csv")).toBe(true)
    }
  })

  it("refuses to start a download on the server", () => {
    const { adapter, runtime } = setup(true)
    const result = adapter.download(file("clientes.csv"), { type: "CLIENTES" })
    expect(result.success).toBe(false)
    expect(!result.success && result.error.code).toBe("UNSUPPORTED")
    expect(runtime.createURL).not.toHaveBeenCalled()
    expect(runtime.click).not.toHaveBeenCalled()
  })

  it("refuses empty bytes and contains a failing runtime instead of throwing", () => {
    const { adapter, runtime } = setup()
    const empty = adapter.download({ bytes: new Blob(), fileName: null }, { type: "CLIENTES" })
    expect(!empty.success && empty.error.code).toBe("INVALID_RESPONSE")
    expect(runtime.click).not.toHaveBeenCalled()

    runtime.createURL.mockImplementation(() => {
      throw new TypeError("no object urls here")
    })
    const broken = adapter.download(file("clientes.csv"), { type: "CLIENTES" })
    expect(!broken.success && broken.error.code).toBe("UNEXPECTED")
    expect(runtime.revokeURL).not.toHaveBeenCalled()
  })
})
