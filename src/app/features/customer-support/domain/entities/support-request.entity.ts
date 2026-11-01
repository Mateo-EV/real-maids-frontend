export class SupportRequest {
  private constructor(
    public id: number,
    public customerId: number,
    public orderId: number | null,
    public requestTypeId: number,
    public statusId: number,
    public subject: string,
    public description: string,
    public registeredAt: Date,
    public closedAt: Date | null
  ) {}

  static create(
    id: number,
    customerId: number,
    orderId: number | null,
    requestTypeId: number,
    statusId: number,
    subject: string,
    description: string,
    registeredAt: Date,
    closedAt: Date | null
  ): SupportRequest {
    return new SupportRequest(
      id,
      customerId,
      orderId,
      requestTypeId,
      statusId,
      subject,
      description,
      registeredAt,
      closedAt
    )
  }
}
