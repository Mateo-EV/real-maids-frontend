export class StaffAvailability {
  private constructor(
    public id: number,
    public staffId: number,
    public weekday: string,
    public startTime: string,
    public endTime: string,
    public isActive: boolean
  ) {}

  static create(
    id: number,
    staffId: number,
    weekday: string,
    startTime: string,
    endTime: string,
    isActive: boolean
  ): StaffAvailability {
    return new StaffAvailability(id, staffId, weekday, startTime, endTime, isActive)
  }
}
