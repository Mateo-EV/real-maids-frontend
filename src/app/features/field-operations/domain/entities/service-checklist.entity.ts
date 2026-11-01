export class ServiceChecklist {
  private constructor(
    public id: number,
    public orderId: number,
    public taskId: number,
    public isCompleted: boolean,
    public comment: string | null,
    public registeredAt: Date | null
  ) {}

  static create(
    id: number,
    orderId: number,
    taskId: number,
    isCompleted: boolean,
    comment: string | null,
    registeredAt: Date | null
  ): ServiceChecklist {
    return new ServiceChecklist(id, orderId, taskId, isCompleted, comment, registeredAt)
  }
}
