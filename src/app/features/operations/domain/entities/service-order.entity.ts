export class ServiceOrder {
  private constructor(
    public id: number,
    public requestId: number | null,
    public contractId: number | null,
    public propertyId: number,
    public statusId: number,
    public code: string,
    public estimatedAmount: string | null,
    public observation: string | null,
    public sourceSystem: string | null,
    public externalId: string | null,
    public createdAt: Date,
    public updatedAt: Date | null,
    public registeredByUserId: number | null
  ) {}

  static create(
    id: number,
    requestId: number | null,
    contractId: number | null,
    propertyId: number,
    statusId: number,
    code: string,
    estimatedAmount: string | null,
    observation: string | null,
    sourceSystem: string | null,
    externalId: string | null,
    createdAt: Date,
    updatedAt: Date | null,
    registeredByUserId: number | null
  ): ServiceOrder {
    return new ServiceOrder(
      id,
      requestId,
      contractId,
      propertyId,
      statusId,
      code,
      estimatedAmount,
      observation,
      sourceSystem,
      externalId,
      createdAt,
      updatedAt,
      registeredByUserId
    )
  }
}
