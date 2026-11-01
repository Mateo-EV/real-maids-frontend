export class Payment {
  private constructor(
    public id: number,
    public invoiceId: number,
    public paymentMethodId: number | null,
    public amount: string,
    public externalReference: string | null,
    public paidAt: Date,
    public registeredByUserId: number | null
  ) {}

  static create(
    id: number,
    invoiceId: number,
    paymentMethodId: number | null,
    amount: string,
    externalReference: string | null,
    paidAt: Date,
    registeredByUserId: number | null
  ): Payment {
    return new Payment(
      id,
      invoiceId,
      paymentMethodId,
      amount,
      externalReference,
      paidAt,
      registeredByUserId
    )
  }
}
