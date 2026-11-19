import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ReportsHttpSource } from "./reports-http.source"

const base = "https://api.example.test"
const csvUrl = `${base}/api/reportes/CLIENTES/csv`

/** Bytes in this realm (a Node `TextEncoder` buffer would fail the `instanceof` check). */
const csvBytes = (text: string): ArrayBuffer => {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff
  return bytes.buffer
}

const csvText = "Cliente,Servicios\nAna,3\nBeto,0\n"

function setup(server = false) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: base },
      { provide: PLATFORM_ID, useValue: server ? "server" : "browser" }
    ]
  })
  return { source: TestBed.inject(ReportsHttpSource), http: TestBed.inject(HttpTestingController) }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    TestBed.resetTestingModule()
  }
})

// W7 / S4: the CSV of a type and period, as the server sent it.
describe("ReportsHttpSource CSV export", () => {
  it("maps the type and the optional period and keeps the supplied filename", async () => {
    const { source, http } = setup()
    const read = firstValueFrom(
      source.exportReportCsv({ type: "CLIENTES", from: "2026-01-01", to: "2026-01-31" })
    )
    const request = http.expectOne(candidate => candidate.url === csvUrl)
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    expect(request.request.responseType).toBe("arraybuffer")
    expect([request.request.params.get("desde"), request.request.params.get("hasta")]).toEqual([
      "2026-01-01",
      "2026-01-31"
    ])
    request.flush(csvBytes(csvText), {
      headers: {
        "content-type": "text/csv; charset=UTF-8",
        "content-disposition": 'attachment; filename="clientes-2026-01.csv"'
      }
    })

    const result = await read
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.fileName).toBe("clientes-2026-01.csv")
    expect(result.data.bytes).toBeInstanceOf(Blob)
    expect(result.data.bytes.type).toBe("text/csv")
    expect(await result.data.bytes.text()).toBe(csvText)
  })

  it("omits blank dates instead of sending an empty value", async () => {
    const { source, http } = setup()
    const read = firstValueFrom(source.exportReportCsv({ type: "CLIENTES", from: "", to: "   " }))
    const request = http.expectOne(candidate => candidate.url === csvUrl)
    expect(request.request.params.keys()).toEqual([])
    request.flush(csvBytes(csvText), { headers: { "content-type": "text/csv" } })
    expect((await read).success).toBe(true)
  })

  it("reads a server without a filename header without inventing one", async () => {
    const { source, http } = setup()
    const read = firstValueFrom(source.exportReportCsv({ type: "CLIENTES" }))
    http.expectOne(candidate => candidate.url === csvUrl).flush(csvBytes(csvText))
    const result = await read
    expect(result.success && result.data.fileName).toBeNull()
  })

  it("refuses an unusable period or a blank type before dispatching", async () => {
    const { source, http } = setup()
    for (const params of [
      { type: "CLIENTES", from: "2026-02-30" },
      { type: "CLIENTES", from: "2026-02-10", to: "2026-02-01" },
      { type: "   " }
    ]) {
      const result = await firstValueFrom(source.exportReportCsv(params))
      expect(!result.success && result.error.code, JSON.stringify(params)).toBe("VALIDATION")
    }
    http.expectNone(() => true)
  })

  it("rejects a malformed or non-text answer instead of saving garbage", async () => {
    const { source, http } = setup()
    // The testing backend only flushes a real byte buffer for an `arraybuffer` response, so a
    // body of another shape cannot be simulated here; the decoder still refuses it.
    const bodies: {
      body: ArrayBuffer
      headers?: Record<string, string>
      why: string
    }[] = [
      { body: new ArrayBuffer(0), why: "empty body" },
      // Invalid UTF-8 sequences (lone continuation byte and a truncated 3-byte lead).
      { body: new Uint8Array([0x41, 0x2c, 0x80]).buffer, why: "invalid utf-8" },
      { body: new Uint8Array([0xe2, 0x82]).buffer, why: "truncated utf-8" },
      // Valid UTF-8 that is still binary: NUL and C0 control bytes.
      { body: new Uint8Array([0x41, 0x00, 0x42]).buffer, why: "nul byte" },
      { body: new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, why: "control bytes" },
      {
        body: csvBytes("<html>error</html>"),
        headers: { "content-type": "text/html" },
        why: "html answer"
      },
      {
        body: csvBytes('{"error":"boom"}'),
        headers: { "content-type": "application/json" },
        why: "json answer"
      },
      {
        body: new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer,
        headers: { "content-type": "application/pdf" },
        why: "pdf answer"
      }
    ]
    for (const { body, headers, why } of bodies) {
      const read = firstValueFrom(source.exportReportCsv({ type: "CLIENTES" }))
      http.expectOne(candidate => candidate.url === csvUrl).flush(body, headers ? { headers } : {})
      const result = await read
      expect(result.success, why).toBe(false)
      expect(!result.success && result.error.code, why).toBe("INVALID_RESPONSE")
    }
  })

  it("accepts the Excel type many servers use to serve a CSV download", async () => {
    const { source, http } = setup()
    const read = firstValueFrom(source.exportReportCsv({ type: "CLIENTES" }))
    http
      .expectOne(candidate => candidate.url === csvUrl)
      .flush(csvBytes("a,b\n1,2\n"), {
        headers: { "content-type": "application/vnd.ms-excel; charset=UTF-8" }
      })
    const result = await read
    expect(result.success).toBe(true)
  })

  it("maps a forbidden export to FORBIDDEN and dispatches nothing on the server", async () => {
    const { source, http } = setup()
    const read = firstValueFrom(source.exportReportCsv({ type: "CLIENTES" }))
    http
      .expectOne(candidate => candidate.url === csvUrl)
      .flush(new ArrayBuffer(0), { status: 403, statusText: "Forbidden" })
    const result = await read
    expect(!result.success && result.error.code).toBe("FORBIDDEN")

    TestBed.resetTestingModule()
    const server = setup(true)
    const offline = await firstValueFrom(server.source.exportReportCsv({ type: "CLIENTES" }))
    expect(!offline.success && offline.error.code).toBe("NETWORK")
    server.http.expectNone(() => true)
  })
})
