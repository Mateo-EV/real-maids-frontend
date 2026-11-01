export class ReschedulingReason {
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
  ): ReschedulingReason {
    return new ReschedulingReason(id, name, description, isActive)
  }
}
