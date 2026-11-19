import { DOCUMENT, isPlatformBrowser } from "@angular/common"
import { inject, Injectable, InjectionToken, PLATFORM_ID } from "@angular/core"
import { Result } from "@/app/shared/utils/result"
import { ReportsSettingsError } from "../../domain/errors/reports-settings.error"
import { ReportCsvFile, reportCsvFileName } from "../../domain/models/report.models"
import { GenerateReportParams } from "../../domain/params/reports-settings.params"

export interface ReportDownloadRuntime {
  createURL(blob: Blob): string
  revokeURL(url: string): void
  click(anchor: HTMLAnchorElement): void
}

export const REPORT_DOWNLOAD_RUNTIME = new InjectionToken<ReportDownloadRuntime>(
  "report.download-runtime",
  {
    providedIn: "root",
    factory: () => ({
      createURL: blob => URL.createObjectURL(blob),
      revokeURL: url => URL.revokeObjectURL(url),
      click: anchor => anchor.click()
    })
  }
)

/**
 * Browser half of the CSV slice (W7): turns the bytes the server already sent into a file
 * download through a temporary anchor. Nothing here requests anything — the request belongs to
 * the store action — and nothing runs on the server.
 */
@Injectable({ providedIn: "root" })
export class ReportCsvDownload {
  private readonly document = inject(DOCUMENT)
  private readonly platform = inject(PLATFORM_ID)
  private readonly runtime = inject(REPORT_DOWNLOAD_RUNTIME)

  download(file: ReportCsvFile, params: GenerateReportParams): Result<void, ReportsSettingsError> {
    if (!isPlatformBrowser(this.platform))
      return Result.failure(new ReportsSettingsError("UNSUPPORTED"))
    let url: string | undefined
    let anchor: HTMLAnchorElement | undefined
    try {
      // The received bytes are saved as they are; only the name is chosen here.
      if (!(file.bytes instanceof Blob) || !file.bytes.size)
        return Result.failure(new ReportsSettingsError("INVALID_RESPONSE"))
      url = this.runtime.createURL(file.bytes)
      anchor = this.document.createElement("a")
      anchor.href = url
      anchor.download = reportCsvFileName(file.fileName, params)
      anchor.hidden = true
      this.document.body.appendChild(anchor)
      this.runtime.click(anchor)
      return Result.success(undefined)
    } catch {
      return Result.failure(new ReportsSettingsError("UNEXPECTED"))
    } finally {
      try {
        anchor?.remove()
      } catch {
        /* Best-effort DOM cleanup after the download was initiated. */
      }
      if (url !== undefined) {
        try {
          this.runtime.revokeURL(url)
        } catch {
          /* Cleanup must not throw a raw browser error. */
        }
      }
    }
  }
}
