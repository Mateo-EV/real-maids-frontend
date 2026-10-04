import { Lang, User } from "../../domain/entities/user.entity"
import { CreateRoleParams } from "../../domain/params/create-role.params"
import { CreateUserParams } from "../../domain/params/create-user.params"

// FICTITIOUS DEMO DATA — role names are a demo catalog, not an authorization model.
// TODO integration: replace with the confirmed internal API role catalog; no permission matrix.
export const DEMO_ROLES: readonly CreateRoleParams[] = [
  { name: "Administración", description: "Administración general del sistema.", isActive: true },
  { name: "Operaciones", description: "Coordinación de operaciones y servicios.", isActive: true },
  { name: "Personal Campo", description: "Personal de campo y ejecución de servicios.", isActive: true },
  { name: "Cliente (Portal)", description: "Clientes del portal de servicios.", isActive: true },
  { name: "Supervisión", description: "Supervisión y seguimiento de operaciones.", isActive: true }
]

// FICTITIOUS DEMO DATA — profile identities and access timestamps are invented.
// TODO integration: obtain profiles and read-only lastAccess from the confirmed users API.
// Reserved .test addresses prevent these fixtures from implying real customer identities.
const referenceNames = ["Carlos Mendoza", "Laura Sánchez", "María Rodríguez", "Johnathan Taylor", "David Gómez"]
const givenNames = ["Ana", "Luis", "Elena", "Miguel", "Sofía", "Andrés", "Lucía", "Daniel"]
const familyNames = ["Vargas", "Torres", "Ramos", "Castillo", "Morales", "Herrera"]
export const DEMO_PASSWORD_PLACEHOLDER = "DEMO-UNUSED-NOT-A-CREDENTIAL"
export function demoUsers(roleIds: readonly number[]): CreateUserParams[] {
  return Array.from({ length: 48 }, (_, index) => ({
    name: referenceNames[index] ?? `${givenNames[(index - 5) % givenNames.length]} ${familyNames[Math.floor((index - 5) / givenNames.length)]}`,
    age: 24 + index % 30,
    email: `persona.${index + 1}@example.test`,
    password: DEMO_PASSWORD_PLACEHOLDER,
    lang: index === 3 || index % 7 === 6 ? Lang.EN : Lang.ES,
    isActive: index !== 4 && index < 43,
    roleId: roleIds[index === 4 ? 2 : index % roleIds.length],
    lastAccess: index === 4 || index % 8 === 7 ? null : new Date(Date.UTC(2026, 8, 1, 19 - index % 12, index % 60))
  }))
}

// FICTITIOUS DEMO DATA — sessions and audit are decorative numbers, not monitored activity.
// TODO integration: remove these metrics until confirmed sessions/audit endpoints are connected.
export const DEMO_METRICS = { sessions: 12, mobileSessions: 3, auditEvents: 324 } as const

// FICTITIOUS DEMO DATA — entity bindings, documentation-only IPs and profile decoration.
// TODO integration: replace with confirmed entity relationships and authorized session metadata.
const entityLabels = ["Interno (Staff)", "Despacho Central", "personal_campo: #PC-08", "cliente: #CLI-204", "personal_campo: #PC-15"]
export function demoDecoration(user: User): { entity: string; ip: string | null } {
  const match = /^persona\.(\d+)@example\.test$/.exec(user.email)
  if (!match) return { entity: "Sin vínculo", ip: null }
  const index = Number(match[1]) - 1
  return { entity: entityLabels[index % entityLabels.length], ip: `192.0.2.${index + 1}` }
}

// Initials derive from actual loaded names; no external image or invented identity is fetched.
export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase() || "?"
}
