export class UserSession {
  private constructor(
    public id: number,
    public userId: number,
    public ip: string,
    public device: string,
    public startDate: Date,
    public expiryDate: Date,
    // Caller-relative backend metadata, never an auth credential/session key.
    public isCurrent: boolean = false,
    public userName?: string,
    public userEmail?: string
  ) {}

  static create(
    id: number,
    userId: number,
    ip: string,
    device: string,
    startDate: Date,
    expireDate: Date,
    isCurrent: boolean = false,
    userName?: string,
    userEmail?: string
  ): UserSession {
    return new UserSession(
      id,
      userId,
      ip,
      device,
      startDate,
      expireDate,
      isCurrent,
      userName,
      userEmail
    )
  }
}
