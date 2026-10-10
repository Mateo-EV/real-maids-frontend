// Reference illustration identifiers, NOT product M01–M12 or a backend ACL.
export const RBAC_MODULES = [
  { id: "security", label: "01. Auth, Seguridad & Auditoría" },
  { id: "landing", label: "02. Landing Page & CMS" },
  { id: "crm", label: "03. CRM & Embudo de Ventas" },
  { id: "customers", label: "04. Clientes & Propiedades" },
  { id: "scheduling", label: "07. Operaciones & Despacho (Scheduling)" },
  { id: "billing", label: "10. Facturación & Pagos" },
  { id: "configuration", label: "14. Configuración & QuickBooks ERP" }
] as const
export const RBAC_ACTIONS = [
  { id: "read", label: "Ver / Lectura (R)" },
  { id: "create", label: "Crear (C)" },
  { id: "update", label: "Editar (U)" },
  { id: "delete", label: "Eliminar (D)" },
  { id: "export", label: "Exportar / Sinc." }
] as const
export type RbacModule = (typeof RBAC_MODULES)[number]["id"]
export type RbacAction = (typeof RBAC_ACTIONS)[number]["id"]
export interface RbacGrant {
  module: RbacModule
  action: RbacAction
}
export interface RbacMatrix {
  roleId: number
  configured: boolean
  grants: RbacGrant[]
}
export const copyRbacMatrix = (matrix: RbacMatrix): RbacMatrix => ({
  roleId: matrix.roleId,
  configured: matrix.configured,
  grants: matrix.grants.map(grant => ({ module: grant.module, action: grant.action }))
})

// Textual reference annotations: display-only, never inferred enforcement from checkboxes.
export const OPERATIONS_RULES: Readonly<Record<RbacModule, string>> = {
  security: "Solo usuarios de su área",
  landing: "Solo lectura de leads",
  crm: "Completo sin borrar leads",
  customers: "Acceso a código de puerta",
  scheduling: "Control Total de Despacho",
  billing: "Solo lectura de saldos",
  configuration: "Sin Acceso (Restringido)"
}
