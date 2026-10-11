import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { describe, expect, it, vi } from "vitest"
import { AUDIT_DOWNLOAD_RUNTIME, AuditCsvDownload } from "./audit-csv-download"

describe("Audit backend-byte download", () => {
  function setup(platform = "browser", fail = false) {
    const runtime = {
      createURL: vi.fn((_blob: Blob) => "blob:synthetic"),
      revokeURL: vi.fn(),
      click: vi.fn((anchor: HTMLAnchorElement) => {
        expect(anchor.download).toBe("auditoria.csv")
        expect(document.body.contains(anchor)).toBe(true)
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
  it("preserves exact blob bytes and uses a fixed safe filename with DOM/URL cleanup", () => {
    const { runtime, adapter } = setup()
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf, 0xc3, 0xb1, 0x0a])], {
      type: "text/csv"
    })
    expect(adapter.download(blob).success).toBe(true)
    expect(runtime.createURL).toHaveBeenCalledExactlyOnceWith(blob)
    expect(runtime.click).toHaveBeenCalledOnce()
    expect(runtime.revokeURL).toHaveBeenCalledExactlyOnceWith("blob:synthetic")
    expect(document.querySelector('a[download="auditoria.csv"]')).toBeNull()
  })
  it("returns typed initiation failure and still cleans resources", () => {
    const { runtime, adapter } = setup("browser", true)
    expect(adapter.download(new Blob(["csv"]))).toMatchObject({
      success: false,
      error: { code: "DOWNLOAD_FAILED" }
    })
    expect(runtime.revokeURL).toHaveBeenCalledExactlyOnceWith("blob:synthetic")
    expect(document.querySelector('a[download="auditoria.csv"]')).toBeNull()
  })
  it("does not touch browser APIs on server", () => {
    const { runtime, adapter } = setup("server")
    expect(adapter.download(new Blob(["csv"]))).toMatchObject({
      success: false,
      error: { code: "DOWNLOAD_UNAVAILABLE" }
    })
    expect(runtime.createURL).not.toHaveBeenCalled()
    expect(runtime.click).not.toHaveBeenCalled()
  })
  it("rejects empty bytes before creating a URL", () => {
    const { runtime, adapter } = setup()
    expect(adapter.download(new Blob())).toMatchObject({
      success: false,
      error: { code: "EXPORT_EMPTY" }
    })
    expect(runtime.createURL).not.toHaveBeenCalled()
  })
  it("maps URL creation failure without leaked DOM", () => {
    const { runtime, adapter } = setup()
    runtime.createURL.mockImplementation(() => {
      throw new Error("browser detail")
    })
    expect(adapter.download(new Blob(["CSV"]))).toMatchObject({
      success: false,
      error: { code: "DOWNLOAD_FAILED" }
    })
    expect(runtime.revokeURL).not.toHaveBeenCalled()
    expect(document.querySelector('a[download="auditoria.csv"]')).toBeNull()
  })
})
