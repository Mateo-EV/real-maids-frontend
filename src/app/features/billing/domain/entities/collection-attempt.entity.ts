export class CollectionAttempt {
  private constructor(
    public id: number,
    public invoiceId: number,
    public paymentMethodId: number | null,
    public attemptNumber: number,
    public result: string,
    public rejectionReason: string | null,
    public attemptedAt: Date
  ) {}

  static create(
    id: number,
    invoiceId: number,
    paymentMethodId: number | null,
    attemptNumber: number,
    result: string,
    rejectionReason: string | null,
    attemptedAt: Date
  ): CollectionAttempt {
    return new CollectionAttempt(
      id,
      invoiceId,
      paymentMethodId,
      attemptNumber,
      result,
      rejectionReason,
      attemptedAt
    )
  }
}
