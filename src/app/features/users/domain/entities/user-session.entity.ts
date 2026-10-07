export class UserSession {
  private constructor(
    public id: number,
    public userId: number,
    public ip: string,
    public device: string
  ) {}

  static create(id: number, userId: number, ip: string, device: string): UserSession {
    return new UserSession(id, userId, ip, device)
  }
}
