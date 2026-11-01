/** Safe, server-allowlisted settings only; never transport raw system secrets. */
export class SystemParameter {
  private constructor(
    public id: number,
    public key: string,
    public value: string,
    public description: string | null,
    public updatedAt: Date | null
  ) {}

  static create(
    id: number,
    key: string,
    value: string,
    description: string | null,
    updatedAt: Date | null
  ): SystemParameter {
    return new SystemParameter(id, key, value, description, updatedAt)
  }
}
