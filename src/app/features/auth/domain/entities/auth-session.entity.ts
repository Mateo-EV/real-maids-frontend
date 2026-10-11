export class AuthSession {
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
  ): AuthSession {
    return new AuthSession(name, email, role, expiresAt)
  }
}
