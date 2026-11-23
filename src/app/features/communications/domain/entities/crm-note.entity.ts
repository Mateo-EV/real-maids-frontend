/**
 * A saved CRM note. Exactly one owner is recorded by the backend (`customerId` xor `leadId`), the
 * author always comes from the authenticated session and editing records `editedAt`. There is no
 * deletion: a note is an append-only record that its author may rewrite.
 */
export class CrmNote {
  private constructor(
    public readonly id: number,
    public readonly customerId: number | null,
    public readonly leadId: number | null,
    public readonly content: string,
    public readonly authorId: number,
    public readonly author: string,
    public readonly registeredAt: Date,
    public readonly editedAt: Date | null
  ) {}

  static create(
    id: number,
    customerId: number | null,
    leadId: number | null,
    content: string,
    authorId: number,
    author: string,
    registeredAt: Date,
    editedAt: Date | null
  ): CrmNote {
    return new CrmNote(id, customerId, leadId, content, authorId, author, registeredAt, editedAt)
  }
}
