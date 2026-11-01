export class ServiceContract {
  private constructor(
    public id: number,
    public customerId: number,
    public propertyId: number,
    public serviceTypeId: number,
    public frequencyId: number,
    public rateId: number,
    public number: string,
    public preferredDay: string | null,
    public preferredTime: string | null,
    public validFrom: string,
    public validUntil: string | null,
    public isActive: boolean,
    public createdAt: Date,
    public registeredByUserId: number | null
  ) {}

  static create(
    id: number,
    customerId: number,
    propertyId: number,
    serviceTypeId: number,
    frequencyId: number,
    rateId: number,
    number: string,
    preferredDay: string | null,
    preferredTime: string | null,
    validFrom: string,
    validUntil: string | null,
    isActive: boolean,
    createdAt: Date,
    registeredByUserId: number | null
  ): ServiceContract {
    return new ServiceContract(
      id,
      customerId,
      propertyId,
      serviceTypeId,
      frequencyId,
      rateId,
      number,
      preferredDay,
      preferredTime,
      validFrom,
      validUntil,
      isActive,
      createdAt,
      registeredByUserId
    )
  }
}
