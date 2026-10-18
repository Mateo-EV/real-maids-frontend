export function dtoRecord(value: unknown, invalid: () => never): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}

export const dtoText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

export const dtoId = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= -2147483648 &&
  value <= 2147483647

// Preserves the user/role timestamp rules; callers may require stricter time validation.
export function dtoDate(value: unknown, invalid: () => never): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    invalid()
  const date = new Date(value)
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10))
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (!Number.isFinite(date.getTime()) || month < 1 || month > 12 || day < 1 || day > days)
    invalid()
  return date
}
