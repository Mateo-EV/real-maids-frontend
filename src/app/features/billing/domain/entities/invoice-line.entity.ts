export class InvoiceLine {
  private constructor(
    public id: number,
    public invoiceId: number,
    public serviceTypeId: number | null,
    public additionalServiceId: number | null,
    public description: string,
    public quantity: number,
    public unitPrice: string,
    public subtotal: string
  ) {}

  static create(
    id: number,
    invoiceId: number,
    serviceTypeId: number | null,
    additionalServiceId: number | null,
    description: string,
    quantity: number,
    unitPrice: string,
    subtotal: string
  ): InvoiceLine {
    return new InvoiceLine(
      id,
      invoiceId,
      serviceTypeId,
      additionalServiceId,
      description,
      quantity,
      unitPrice,
      subtotal
    )
  }
}
