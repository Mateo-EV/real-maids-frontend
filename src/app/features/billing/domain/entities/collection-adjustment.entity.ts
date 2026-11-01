export class CollectionAdjustment {
  private constructor(
    public id: number,
    public invoiceId: number,
    public userId: number,
    public type: string,
    public amount: string,
    public reason: string,
    public adjustedAt: Date
  ) {}

  static create(
    id: number,
    invoiceId: number,
    userId: number,
    type: string,
    amount: string,
    reason: string,
    adjustedAt: Date
  ): CollectionAdjustment {
    return new CollectionAdjustment(id, invoiceId, userId, type, amount, reason, adjustedAt)
  }
}
