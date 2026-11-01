export class ServiceFrequency {
  private constructor(
    public id: number,
    public name: string,
    public intervalDays: number,
    public isActive: boolean
  ) {}

  static create(
    id: number,
    name: string,
    intervalDays: number,
    isActive: boolean
  ): ServiceFrequency {
    return new ServiceFrequency(id, name, intervalDays, isActive)
  }
}
