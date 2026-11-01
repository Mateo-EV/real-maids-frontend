export class QuoteLine {
  private constructor(
    public id: number,
    public quoteId: number,
    public serviceTypeId: number | null,
    public additionalServiceId: number | null,
    public description: string | null,
    public quantity: number,
    public unitPrice: string,
    public subtotal: string
  ) {}

  static create(
    id: number,
    quoteId: number,
    serviceTypeId: number | null,
    additionalServiceId: number | null,
    description: string | null,
    quantity: number,
    unitPrice: string,
    subtotal: string
  ): QuoteLine {
    return new QuoteLine(
      id,
      quoteId,
      serviceTypeId,
      additionalServiceId,
      description,
      quantity,
      unitPrice,
      subtotal
    )
  }
}
