export class SentNotification {
  private constructor(
    public id: string,
    public templateId: number | null,
    public userId: number | null,
    public orderId: number | null,
    public recipient: string,
    public deliveryStatus: string,
    public errorDetail: string | null,
    public sentAt: Date
  ) {}

  static create(
    id: string,
    templateId: number | null,
    userId: number | null,
    orderId: number | null,
    recipient: string,
    deliveryStatus: string,
    errorDetail: string | null,
    sentAt: Date
  ): SentNotification {
    return new SentNotification(
      id,
      templateId,
      userId,
      orderId,
      recipient,
      deliveryStatus,
      errorDetail,
      sentAt
    )
  }
}
