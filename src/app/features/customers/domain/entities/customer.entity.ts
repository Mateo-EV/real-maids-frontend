export enum CustomerType {
  RESIDENTIAL = "residencial",
  COMMERCIAL = "comercial"
}

export class Customer {
  private constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly userId: number | null,
    public readonly type: CustomerType,
    public readonly email: string | null,
    public readonly phone: string | null,
    public readonly taxIdentification: string | null,
    public readonly systemOrigin: string | null,
    public readonly externalId: string | null,
    public readonly isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date | null,
    public readonly registeredByUserId: number | null,
    public readonly leadId: number | null
  ) {}

  static create(
    id: number,
    name: string,
    userId: number | null,
    type: CustomerType,
    email: string | null,
    phone: string | null,
    taxIdentification: string | null,
    systemOrigin: string | null,
    externalId: string | null,
    isActive: boolean,
    createdAt: Date,
    updatedAt: Date | null,
    registeredByUserId: number | null,
    leadId: number | null
  ): Customer {
    return new Customer(
      id,
      name,
      userId,
      type,
      email,
      phone,
      taxIdentification,
      systemOrigin,
      externalId,
      isActive,
      createdAt,
      updatedAt,
      registeredByUserId,
      leadId
    )
  }
}
