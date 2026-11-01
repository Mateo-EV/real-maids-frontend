export class ServiceType {
  private constructor(
    public id: number,
    public categoryId: number,
    public name: string,
    public description: string | null,
    public estimatedDurationMinutes: number,
    public isActive: boolean
  ) {}

  static create(
    id: number,
    categoryId: number,
    name: string,
    description: string | null,
    estimatedDurationMinutes: number,
    isActive: boolean
  ): ServiceType {
    return new ServiceType(id, categoryId, name, description, estimatedDurationMinutes, isActive)
  }
}
