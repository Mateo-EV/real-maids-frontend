export class UserSession {
  private constructor(
    public readonly name: string | null,
    public readonly email: string,
    // Returned label only, never a permission grant or a demo role ID.
    public readonly role: string | null,
    public readonly expiresAt: number | null
  ) {}

  static create(
    name: string | null,
    email: string,
    role: string | null = null,
    expiresAt: number | null = null
  ): UserSession {
    return new UserSession(name, email, role, expiresAt)
  }
}
