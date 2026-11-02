export class LeadFollowUp {
  private constructor(
    public readonly id: number,
    public readonly leadId: number,
    public readonly userId: number,
    public readonly stageId: number,
    public readonly comment: string | null,
    public readonly occurredAt: Date
  ) {}

  static create(
    id: number,
    leadId: number,
    userId: number,
    stageId: number,
    comment: string | null,
    occurredAt: Date
  ): LeadFollowUp {
    return new LeadFollowUp(id, leadId, userId, stageId, comment, occurredAt)
  }
}
