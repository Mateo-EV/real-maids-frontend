export class WorkLog {
  private constructor(
    public id: number,
    public orderId: number,
    public staffId: number,
    public startedAt: Date,
    public endedAt: Date | null,
    public observation: string | null
  ) {}

  static create(
    id: number,
    orderId: number,
    staffId: number,
    startedAt: Date,
    endedAt: Date | null,
    observation: string | null
  ): WorkLog {
    return new WorkLog(id, orderId, staffId, startedAt, endedAt, observation)
  }
}
