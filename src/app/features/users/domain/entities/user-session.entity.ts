export class UserSession {
  private constructor(
    public id: number,
    public userId: number,
    public ip: string,
    public device: string,
    public startDate: Date,
    public expiryDate: Date,
    // Simulated registry designation only; never linked to AuthStore or browser credentials.
    public isCurrent: boolean = false
  ) {}

  static create(
    id: number,
    userId: number,
    ip: string,
    device: string,
    startDate: Date,
    expireDate: Date,
    isCurrent: boolean = false
  ): UserSession {
    return new UserSession(id, userId, ip, device, startDate, expireDate, isCurrent)
  }
}
