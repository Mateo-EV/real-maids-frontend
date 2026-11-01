export class ProspectOrigin {
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
  ): ProspectOrigin {
    return new ProspectOrigin(id, name, description, isActive)
  }
}
