import { DOCUMENT, isPlatformBrowser } from "@angular/common"
import { inject, Injectable, InjectionToken, PLATFORM_ID } from "@angular/core"
import { Result } from "@/app/shared/utils/result"
import { AuditLogError } from "../../domain/errors/audit-log.error"

export interface AuditDownloadRuntime {
  createURL(blob: Blob): string
  revokeURL(url: string): void
  click(anchor: HTMLAnchorElement): void
}
export const AUDIT_DOWNLOAD_RUNTIME = new InjectionToken<AuditDownloadRuntime>(
  "audit.download-runtime",
  {
    providedIn: "root",
    factory: () => ({
      createURL: blob => URL.createObjectURL(blob),
      revokeURL: url => URL.revokeObjectURL(url),
      click: anchor => anchor.click()
    })
  }
)

@Injectable({ providedIn: "root" })
export class AuditCsvDownload {
  private readonly document = inject(DOCUMENT)
  private readonly platform = inject(PLATFORM_ID)
  private readonly runtime = inject(AUDIT_DOWNLOAD_RUNTIME)

  download(csv: string): Result<void, AuditLogError> {
    if (!isPlatformBrowser(this.platform))
      return Result.failure(new AuditLogError("DOWNLOAD_UNAVAILABLE"))
    let url: string | undefined
    let anchor: HTMLAnchorElement | undefined
    try {
      url = this.runtime.createURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }))
      anchor = this.document.createElement("a")
      anchor.href = url
      anchor.download = "auditoria.csv"
      anchor.hidden = true
      this.document.body.appendChild(anchor)
      this.runtime.click(anchor)
      return Result.success(undefined)
    } catch {
      return Result.failure(new AuditLogError("DOWNLOAD_FAILED"))
    } finally {
      anchor?.remove()
      if (url !== undefined) this.runtime.revokeURL(url)
    }
  }
}
