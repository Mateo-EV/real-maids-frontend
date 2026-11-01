export class Property {
  private constructor(
    public readonly id: number,
    public readonly customerId: number,
    public readonly alias: string | null,
    public readonly address: string,
    public readonly city: string | null,
    public readonly region: string | null,
    public readonly postalCode: string | null,
    public readonly areaM2: string | null,
    public readonly roomCount: number | null,
    public readonly bathroomCount: number | null,
    public readonly accessInstructions: string | null,
    public readonly doorCode: string | null,
    public readonly hasPets: boolean,
    public readonly isActive: boolean,
    public readonly createdAt: Date
  ) {}

  static create(
    id: number,
    customerId: number,
    alias: string | null,
    address: string,
    city: string | null,
    region: string | null,
    postalCode: string | null,
    areaM2: string | null,
    roomCount: number | null,
    bathroomCount: number | null,
    accessInstructions: string | null,
    doorCode: string | null,
    hasPets: boolean,
    isActive: boolean,
    createdAt: Date
  ): Property {
    return new Property(
      id,
      customerId,
      alias,
      address,
      city,
      region,
      postalCode,
      areaM2,
      roomCount,
      bathroomCount,
      accessInstructions,
      doorCode,
      hasPets,
      isActive,
      createdAt
    )
  }
}
