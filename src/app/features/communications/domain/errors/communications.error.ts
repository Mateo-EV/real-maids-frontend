export type CommunicationsErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_RESPONSE"
  | "FORBIDDEN"
  | "UNAUTHENTICATED"
  | "CONFLICT"
  | "NETWORK"
  | "UNCONFIGURED"
  | "UNEXPECTED"

const messages: Record<CommunicationsErrorCode, string> = {
  NOT_FOUND: "The note or email is no longer available",
  INVALID_INPUT: "Invalid communications input",
  INVALID_RESPONSE: "Invalid communications service response",
  FORBIDDEN: "The session is not allowed to read or write CRM communications",
  UNAUTHENTICATED: "CRM communications require a valid session",
  CONFLICT: "The CRM communication could not be recorded as requested",
  NETWORK: "CRM communications service unavailable",
  UNCONFIGURED: "CRM communications are not configured for this platform",
  UNEXPECTED: "Unexpected CRM communications error"
}

/** Safe frontend normalization; it never carries backend copy, recipients or message content. */
export class CommunicationsError extends Error {
  constructor(public readonly code: CommunicationsErrorCode) {
    super(messages[code])
    this.name = "CommunicationsError"
  }
}
