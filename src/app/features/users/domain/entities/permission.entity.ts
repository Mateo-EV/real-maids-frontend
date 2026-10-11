// Backend catalog metadata, never a role-name or CRUD-column inference.
export interface Permission {
  id: number
  code: string
  module: string
  description: string
}
export interface PermissionAssignment {
  roleId: number
  permissions: Permission[]
}
export const copyAssignment = (value: PermissionAssignment): PermissionAssignment => ({
  roleId: value.roleId,
  permissions: value.permissions.map(permission => ({ ...permission }))
})
