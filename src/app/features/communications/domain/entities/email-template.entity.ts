/**
 * An editable email template the composer copies into its subject and body. `subject` is nullable
 * (the seeded channel row allows it) and the event/language stay open supplied values.
 */
export class EmailTemplate {
  private constructor(
    public readonly id: number,
    public readonly event: string,
    public readonly language: string,
    public readonly subject: string | null,
    public readonly body: string
  ) {}

  static create(
    id: number,
    event: string,
    language: string,
    subject: string | null,
    body: string
  ): EmailTemplate {
    return new EmailTemplate(id, event, language, subject, body)
  }
}
