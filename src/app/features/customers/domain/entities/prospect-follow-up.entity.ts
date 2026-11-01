export class ProspectFollowUp {
  private constructor(
    public readonly id: number,
    public readonly prospectId: number,
    public readonly userId: number,
    public readonly stageId: number,
    public readonly comment: string | null,
    public readonly occurredAt: Date
  ) {}

  static create(
    id: number,
    prospectId: number,
    userId: number,
    stageId: number,
    comment: string | null,
    occurredAt: Date
  ): ProspectFollowUp {
    return new ProspectFollowUp(id, prospectId, userId, stageId, comment, occurredAt)
  }
}
