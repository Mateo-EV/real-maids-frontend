export class ServiceCategory {
  private constructor(
    public id: number,
    public name: string,
    public description: string | null,
    public isActive: boolean
  ) {}

  static create(
    id: number,
    name: string,
    description: string | null,
    isActive: boolean
  ): ServiceCategory {
    return new ServiceCategory(id, name, description, isActive)
  }
}
