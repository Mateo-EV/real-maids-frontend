export class ServiceRequest {
  private constructor(
    public id: number,
    public propertyId: number,
    public serviceTypeId: number,
    public userId: number,
    public description: string | null,
    public desiredDate: string | null,
    public status: string,
    public registeredAt: Date,
    public updatedAt: Date | null
  ) {}

  static create(
    id: number,
    propertyId: number,
    serviceTypeId: number,
    userId: number,
    description: string | null,
    desiredDate: string | null,
    status: string,
    registeredAt: Date,
    updatedAt: Date | null
  ): ServiceRequest {
    return new ServiceRequest(
      id,
      propertyId,
      serviceTypeId,
      userId,
      description,
      desiredDate,
      status,
      registeredAt,
      updatedAt
    )
  }
}
