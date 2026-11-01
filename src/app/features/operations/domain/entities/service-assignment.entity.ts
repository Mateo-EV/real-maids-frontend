export class ServiceAssignment {
  private constructor(
    public id: number,
    public orderId: number,
    public staffId: number,
    public crewId: number | null,
    public assignedRole: string,
    public assignedAt: Date,
    public registeredByUserId: number | null
  ) {}

  static create(
    id: number,
    orderId: number,
    staffId: number,
    crewId: number | null,
    assignedRole: string,
    assignedAt: Date,
    registeredByUserId: number | null
  ): ServiceAssignment {
    return new ServiceAssignment(
      id,
      orderId,
      staffId,
      crewId,
      assignedRole,
      assignedAt,
      registeredByUserId
    )
  }
}
