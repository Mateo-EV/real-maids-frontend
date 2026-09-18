export class UserSession {
  private constructor(
    public name: string,
    public email: string,
  ) {}

  static create(name: string, email: string): UserSession {
    return new UserSession(name, email);
  }
}
