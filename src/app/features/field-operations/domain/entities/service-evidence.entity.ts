export enum EvidenceMoment {
  Before = "antes",
  After = "despues"
}

export class ServiceEvidence {
  private constructor(
    public id: number,
    public orderId: number,
    public staffId: number | null,
    public fileUrl: string,
    public moment: EvidenceMoment,
    public description: string | null,
    public uploadedAt: Date
  ) {}

  static create(
    id: number,
    orderId: number,
    staffId: number | null,
    fileUrl: string,
    moment: EvidenceMoment,
    description: string | null,
    uploadedAt: Date
  ): ServiceEvidence {
    return new ServiceEvidence(id, orderId, staffId, fileUrl, moment, description, uploadedAt)
  }
}
