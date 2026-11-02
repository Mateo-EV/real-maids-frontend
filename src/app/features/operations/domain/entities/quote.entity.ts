export class Quote {
  private constructor(
    public id: number,
    public leadId: number | null,
    public customerId: number | null,
    public propertyId: number | null,
    public userId: number,
    public number: string,
    public subtotal: string,
    public total: string,
    public status: string,
    public issuedAt: Date,
    public validUntil: string | null
  ) {}

  static create(
    id: number,
    leadId: number | null,
    customerId: number | null,
    propertyId: number | null,
    userId: number,
    number: string,
    subtotal: string,
    total: string,
    status: string,
    issuedAt: Date,
    validUntil: string | null
  ): Quote {
    return new Quote(
      id,
      leadId,
      customerId,
      propertyId,
      userId,
      number,
      subtotal,
      total,
      status,
      issuedAt,
      validUntil
    )
  }
}
