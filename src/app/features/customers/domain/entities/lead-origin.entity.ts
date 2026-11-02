export class LeadOrigin {
  private constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly description: string | null,
    public readonly isActive: boolean
  ) {}

  static create(
    id: number,
    name: string,
    description: string | null,
    isActive: boolean
  ): LeadOrigin {
    return new LeadOrigin(id, name, description, isActive)
  }
}
