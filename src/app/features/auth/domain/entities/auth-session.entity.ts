export class AuthSession {
  private constructor(
    public readonly name: string | null,
    public readonly email: string,
    // Returned label only, never a permission grant or a demo role ID.
    public readonly role: string | null,
    // Fixed session/refresh deadline, not the renewable access-token deadline.
    public readonly expiresAt: number | null,
    public readonly id: number | null = null,
    public readonly roleId: number | null = null,
    public readonly language: "es" | "en" | null = null,
    public readonly permissions: readonly string[] | null = null
  ) {}

  static create(
    name: string | null,
    email: string,
    role: string | null = null,
    expiresAt: number | null = null,
    id: number | null = null,
    roleId: number | null = null,
    language: "es" | "en" | null = null,
    permissions: readonly string[] | null = null
  ): AuthSession {
    return new AuthSession(
      name,
      email,
      role,
      expiresAt,
      id,
      roleId,
      language,
      permissions === null ? null : Object.freeze([...permissions])
    )
  }
}
