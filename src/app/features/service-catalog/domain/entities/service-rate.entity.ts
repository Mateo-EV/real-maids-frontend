export class ServiceRate {
  private constructor(
    public id: number,
    public serviceTypeId: number,
    public frequencyId: number | null,
    public price: string,
    public currency: string,
    public validFrom: string,
    public validUntil: string | null,
    public isActive: boolean
  ) {}

  static create(
    id: number,
    serviceTypeId: number,
    frequencyId: number | null,
    price: string,
    currency: string,
    validFrom: string,
    validUntil: string | null,
    isActive: boolean
  ): ServiceRate {
    return new ServiceRate(
      id,
      serviceTypeId,
      frequencyId,
      price,
      currency,
      validFrom,
      validUntil,
      isActive
    )
  }
}
