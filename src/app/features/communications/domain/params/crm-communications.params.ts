import { PaginationParams } from "@/app/shared/pagination/pagination.params"

/** Notes and emails live under `/api/crm/clientes/{id}` or `/api/crm/prospectos/{id}`. */
export type CrmTargetKind = "customer" | "lead"

/** The verified owner a communication belongs to; the id is validated by the source. */
export interface CrmTarget {
  readonly kind: CrmTargetKind
  readonly id: number
}

/** Note content travels trimmed and required, bounded to the documented 4000 characters. */
export interface CreateCrmNoteParams {
  content: string
}

/** Note author-only edit: the generated identity, author and instants are never sent. */
export interface UpdateCrmNoteParams {
  id: number
  content: string
}

/**
 * Only the template reference and the optional overrides travel. A blank subject or body falls back
 * to the chosen template on the backend; without a template both are required. The recipient and
 * the author are backend-owned.
 */
export interface SendCrmEmailParams {
  templateId: number | null
  subject: string | null
  body: string | null
}

export interface CrmCommunicationQuery extends PaginationParams {}
