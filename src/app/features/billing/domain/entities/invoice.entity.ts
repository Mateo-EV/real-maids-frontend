export class Invoice {
  private constructor(
    public id: number,
    public orderId: number,
    public customerId: number,
    public paymentStatusId: number,
    public number: string,
    public subtotal: string,
    public tax: string,
    public total: string,
    public outstandingBalance: string,
    public issuedAt: Date,
    public dueDate: string | null
  ) {}

  static create(
    id: number,
    orderId: number,
    customerId: number,
    paymentStatusId: number,
    number: string,
    subtotal: string,
    tax: string,
    total: string,
    outstandingBalance: string,
    issuedAt: Date,
    dueDate: string | null
  ): Invoice {
    return new Invoice(
      id,
      orderId,
      customerId,
      paymentStatusId,
      number,
      subtotal,
      tax,
      total,
      outstandingBalance,
      issuedAt,
      dueDate
    )
  }
}
