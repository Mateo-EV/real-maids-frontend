export class ServiceSchedule {
  private constructor(
    public id: number,
    public orderId: number,
    public reasonId: number | null,
    public date: string,
    public startTime: string,
    public endTime: string | null,
    public isCurrent: boolean,
    public registeredAt: Date,
    public registeredByUserId: number | null
  ) {}

  static create(
    id: number,
    orderId: number,
    reasonId: number | null,
    date: string,
    startTime: string,
    endTime: string | null,
    isCurrent: boolean,
    registeredAt: Date,
    registeredByUserId: number | null
  ): ServiceSchedule {
    return new ServiceSchedule(
      id,
      orderId,
      reasonId,
      date,
      startTime,
      endTime,
      isCurrent,
      registeredAt,
      registeredByUserId
    )
  }
}
