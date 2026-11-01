export class OrderStatusHistory {
  private constructor(
    public id: number,
    public orderId: number,
    public statusId: number,
    public userId: number,
    public observation: string | null,
    public occurredAt: Date
  ) {}

  static create(
    id: number,
    orderId: number,
    statusId: number,
    userId: number,
    observation: string | null,
    occurredAt: Date
  ): OrderStatusHistory {
    return new OrderStatusHistory(id, orderId, statusId, userId, observation, occurredAt)
  }
}
