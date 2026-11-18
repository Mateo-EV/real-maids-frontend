/**
 * Opt-in color tones for value badges (customer type, lead origin/stage, request
 * and order status, boolean state). Color is decoration: the badge text always
 * carries the value, so a tone never becomes the only signal.
 *
 * The CSS palette lives once in `src/styles.css` under
 * `[data-slot="badge"][data-badge-tone]`.
 */
export type BadgeTone = "navy" | "blue" | "amber" | "green" | "teal" | "coral" | "muted"

export type BadgeToneKind =
  | "customer-type"
  | "catalog-name"
  | "request-status"
  | "order-status"
  | "active-state"
  | "final-state"

/** Catalog names are free-form, so their hue is a stable hash instead of a rule. */
const CATALOG_TONES: readonly BadgeTone[] = ["blue", "amber", "green", "teal", "coral", "navy"]

const CUSTOMER_TYPE_TONES: Readonly<Record<string, BadgeTone>> = {
  residencial: "blue",
  comercial: "amber"
}

const REQUEST_STATUS_TONES: Readonly<Record<string, BadgeTone>> = {
  registrada: "blue",
  atendida: "green",
  cancelada: "coral"
}

const ORDER_STATUS_TONES: Readonly<Record<string, BadgeTone>> = {
  PENDIENTE: "amber",
  PROGRAMADA: "blue",
  EN_PROCESO: "navy",
  COMPLETADA: "green",
  PAGADO: "teal",
  CANCELADA: "coral"
}

const ACTIVE_LABELS = new Set([
  "activo",
  "activa",
  "active",
  "convertido",
  "convertida",
  "principal",
  "si",
  "sí",
  "true"
])

const FINAL_LABELS = new Set(["final", "si", "sí", "true"])

function normalize(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""
  if (typeof value === "boolean") return value ? "true" : "false"
  return ""
}

function stableHash(value: string): number {
  let hash = 0
  for (const char of value) {
    hash = (hash * 31 + char.codePointAt(0)!) % 100000
  }
  return hash
}

function flagTone(value: unknown, labels: ReadonlySet<string>, tone: BadgeTone): BadgeTone {
  if (typeof value === "boolean") return value ? tone : "muted"
  return labels.has(normalize(value).toLowerCase()) ? tone : "muted"
}

/** Resolves the color tone for one badge value; unknown values stay neutral. */
export function badgeTone(value: unknown, kind: BadgeToneKind): BadgeTone {
  switch (kind) {
    case "customer-type":
      return CUSTOMER_TYPE_TONES[normalize(value).toLowerCase()] ?? "muted"
    case "catalog-name": {
      const name = normalize(value).toLowerCase()
      if (!name || name.includes("no disponible")) return "muted"
      return CATALOG_TONES[stableHash(name) % CATALOG_TONES.length]
    }
    case "request-status":
      return REQUEST_STATUS_TONES[normalize(value).toLowerCase()] ?? "muted"
    case "order-status":
      return ORDER_STATUS_TONES[normalize(value).toUpperCase()] ?? "muted"
    case "active-state":
      return flagTone(value, ACTIVE_LABELS, "green")
    case "final-state":
      return flagTone(value, FINAL_LABELS, "amber")
  }
}
