/** The backend only reports a send it attempted: a failed transport is recorded, never retried. */
export type CrmEmailStatus = "ENVIADO" | "FALLIDO"

/**
 * One recorded email delivery for a customer or a lead. `recipient` is resolved by the backend from
 * the stored record, so the client never supplies it; `errorDetail` is already sanitized.
 */
export class CrmEmail {
  private constructor(
    public readonly id: number,
    public readonly customerId: number | null,
    public readonly leadId: number | null,
    public readonly templateId: number | null,
    public readonly recipient: string,
    public readonly subject: string,
    public readonly body: string,
    public readonly status: CrmEmailStatus,
    public readonly errorDetail: string | null,
    public readonly authorId: number,
    public readonly author: string,
    public readonly sentAt: Date
  ) {}

  static create(
    id: number,
    customerId: number | null,
    leadId: number | null,
    templateId: number | null,
    recipient: string,
    subject: string,
    body: string,
    status: CrmEmailStatus,
    errorDetail: string | null,
    authorId: number,
    author: string,
    sentAt: Date
  ): CrmEmail {
    return new CrmEmail(
      id,
      customerId,
      leadId,
      templateId,
      recipient,
      subject,
      body,
      status,
      errorDetail,
      authorId,
      author,
      sentAt
    )
  }
}
