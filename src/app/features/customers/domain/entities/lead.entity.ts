export class Lead {
  private constructor(
    public readonly id: number,
    public readonly originId: number,
    public readonly stageId: number,
    public readonly name: string,
    public readonly email: string | null,
    public readonly phone: string | null,
    public readonly referenceAddress: string | null,
    public readonly observation: string | null,
    public readonly isConverted: boolean,
    public readonly registeredAt: Date,
    public readonly registeredByUserId: number | null
  ) {}

  static create(
    id: number,
    originId: number,
    stageId: number,
    name: string,
    email: string | null,
    phone: string | null,
    referenceAddress: string | null,
    observation: string | null,
    isConverted: boolean,
    registeredAt: Date,
    registeredByUserId: number | null
  ): Lead {
    return new Lead(
      id,
      originId,
      stageId,
      name,
      email,
      phone,
      referenceAddress,
      observation,
      isConverted,
      registeredAt,
      registeredByUserId
    )
  }
}
