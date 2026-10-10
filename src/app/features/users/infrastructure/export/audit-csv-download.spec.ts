import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { describe, expect, it, vi } from "vitest"
import { AUDIT_DOWNLOAD_RUNTIME, AuditCsvDownload } from "./audit-csv-download"

describe("Audit browser download", () => {
  function setup(platform = "browser", fail = false) {
    const runtime = {
      createURL: vi.fn(() => "blob:demo"),
      revokeURL: vi.fn(),
      click: vi.fn(() => {
        if (fail) throw new Error("failed")
      })
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: AUDIT_DOWNLOAD_RUNTIME, useValue: runtime }
      ]
    })
    return { runtime, adapter: TestBed.inject(AuditCsvDownload) }
  }
  it("initiates CSV download and cleans DOM/URL on success", () => {
    const { runtime, adapter } = setup()
    expect(adapter.download("csv").success).toBe(true)
    expect(runtime.click).toHaveBeenCalledOnce()
    expect(runtime.createURL.mock.calls).toHaveLength(1)
    expect(runtime.revokeURL).toHaveBeenCalledExactlyOnceWith("blob:demo")
    expect(document.querySelector('a[download="auditoria.csv"]')).toBeNull()
  })
  it("returns typed error and still cleans resources when initiation fails", () => {
    const { runtime, adapter } = setup("browser", true)
    expect(adapter.download("csv")).toMatchObject({
      success: false,
      error: { code: "DOWNLOAD_FAILED" }
    })
    expect(runtime.revokeURL).toHaveBeenCalledExactlyOnceWith("blob:demo")
    expect(document.querySelector('a[download="auditoria.csv"]')).toBeNull()
  })
  it("does not touch browser APIs on server", () => {
    const { runtime, adapter } = setup("server")
    expect(adapter.download("csv")).toMatchObject({
      success: false,
      error: { code: "DOWNLOAD_UNAVAILABLE" }
    })
    expect(runtime.createURL).not.toHaveBeenCalled()
    expect(runtime.click).not.toHaveBeenCalled()
  })
})
