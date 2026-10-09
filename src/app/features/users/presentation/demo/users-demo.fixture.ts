import { User } from "../../domain/entities/user.entity"

// FICTITIOUS DEMO DATA — unused by the in-memory source, never a real credential.
export const DEMO_PASSWORD_PLACEHOLDER = "DEMO-UNUSED-NOT-A-CREDENTIAL"

// FICTITIOUS DEMO DATA — audit is decorative, not monitored activity.
// Session counts instead derive from the source-owned simulated registry and expiry.
// TODO integration: replace audit decoration only with confirmed internal contracts.
export const DEMO_METRICS = { auditEvents: 324 } as const

// FICTITIOUS DEMO DATA — entity bindings, documentation-only IPs and profile decoration.
// TODO integration: replace with confirmed entity relationships and authorized session metadata.
const entityLabels = [
  "Interno (Staff)",
  "Despacho Central",
  "personal_campo: #PC-08",
  "cliente: #CLI-204",
  "personal_campo: #PC-15"
]
export function demoDecoration(user: User): { entity: string; ip: string | null } {
  const match = /^persona\.(\d+)@example\.test$/.exec(user.email)
  if (!match) return { entity: "Sin vínculo", ip: null }
  const index = Number(match[1]) - 1
  return { entity: entityLabels[index % entityLabels.length], ip: `192.0.2.${index + 1}` }
}

// Initials derive from actual loaded names; no external image or invented identity is fetched.
export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0))
      .join("")
      .toUpperCase() || "?"
  )
}
