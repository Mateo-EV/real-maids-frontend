/** SQL association snapshot only. RBAC writes still replace permission IDs atomically. */
export class RolePermission {
  private constructor(
    public readonly id: number,
    public readonly roleId: number,
    public readonly permissionId: number
  ) {}

  static create(id: number, roleId: number, permissionId: number): RolePermission {
    return new RolePermission(id, roleId, permissionId)
  }
}
