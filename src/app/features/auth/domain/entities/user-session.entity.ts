export class UserSession {
  private constructor(
    public readonly name: string,
    public readonly email: string
  ) {}

  static create(name: string, email: string): UserSession {
    return new UserSession(name, email)
  }
}
