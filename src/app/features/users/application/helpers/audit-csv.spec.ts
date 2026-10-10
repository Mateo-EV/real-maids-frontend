import { describe, expect, it } from "vitest"
import { AuditLog } from "../../domain/entities/audit-log.entity"
import { serializeAuditCsv } from "./audit-csv"

describe("Audit CSV", () => {
  it("quotes commas, quotes and newlines and includes explicit metadata columns", () => {
    const log = AuditLog.create(
      1,
      2,
      "usuario",
      "UPDATE",
      'línea, "uno"\nsegunda',
      "192.0.2.1",
      new Date(0),
      "Actor",
      "USR-2"
    )
    expect(serializeAuditCsv([log])).toContain('"línea, ""uno""\nsegunda"')
    expect(serializeAuditCsv([log]).split("\r\n")[0]).toBe(
      "timestampUTC,actor,userId,action,entity,recordId,IP,details"
    )
    expect(serializeAuditCsv([log])).toContain('"1970-01-01T00:00:00.000Z","Actor","2"')
  })
  it.each([
    "=SUM(1)",
    "+cmd",
    "-cmd",
    "@cmd",
    " \t=cmd",
    "\r\n@cmd",
    "\u0000 +cmd",
    "\ttext",
    "\u0085=cmd",
    "\u200b@cmd"
  ])("neutralizes spreadsheet markers %s", value => {
    const log = AuditLog.create(1, 1, value, value, value, value, new Date(0), value, value)
    expect(serializeAuditCsv([log])).toContain(`"'${value}"`)
  })
  it("serializes all records without the pagination cap", () => {
    const logs = Array.from({ length: 130 }, (_, i) =>
      AuditLog.create(i, 1, "usuario", "INSERT", "Demo", "192.0.2.1", new Date(0))
    )
    expect(serializeAuditCsv(logs).split("\r\n")).toHaveLength(131)
  })
})
