export class SupportFollowUp {
  private constructor(
    public id: number,
    public requestId: number,
    public userId: number,
    public message: string,
    public createdAt: Date
  ) {}

  static create(
    id: number,
    requestId: number,
    userId: number,
    message: string,
    createdAt: Date
  ): SupportFollowUp {
    return new SupportFollowUp(id, requestId, userId, message, createdAt)
  }
}
