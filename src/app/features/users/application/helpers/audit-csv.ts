import { AuditLog } from "../../domain/entities/audit-log.entity"

function cell(value: string | number): string {
  let text = String(value)
  // Prefix BEFORE quoting: spreadsheet engines can ignore initial whitespace/control characters.
  if (/^[\s\p{Cc}\p{Cf}]*[=+@-]/u.test(text) || /^[\p{Cc}\p{Cf}]/u.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function serializeAuditCsv(logs: readonly AuditLog[]): string {
  return [
    "timestampUTC,actor,userId,action,entity,recordId,IP,details",
    ...logs.map(log =>
      [
        log.date.toISOString(),
        log.actor,
        log.userId,
        log.action,
        log.entity,
        log.recordId,
        log.ip,
        log.details
      ]
        .map(cell)
        .join(",")
    )
  ].join("\r\n")
}
