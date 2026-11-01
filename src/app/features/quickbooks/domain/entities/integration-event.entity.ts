/** All textual diagnostics must already be sanitized by the backend. */
export class IntegrationEvent {
  private constructor(
    public id: string,
    public connectionId: number,
    public synchronizationId: string | null,
    public eventType: string,
    public entity: string | null,
    public localId: string | null,
    public externalId: string | null,
    public httpMethod: string | null,
    public endpoint: string | null,
    public httpStatus: number | null,
    public requestId: string | null,
    public result: string,
    public attemptNumber: number,
    public errorSummary: string | null,
    public payloadSummary: string | null,
    public isProcessed: boolean,
    public occurredAt: Date
  ) {}

  static create(
    id: string,
    connectionId: number,
    synchronizationId: string | null,
    eventType: string,
    entity: string | null,
    localId: string | null,
    externalId: string | null,
    httpMethod: string | null,
    endpoint: string | null,
    httpStatus: number | null,
    requestId: string | null,
    result: string,
    attemptNumber: number,
    errorSummary: string | null,
    payloadSummary: string | null,
    isProcessed: boolean,
    occurredAt: Date
  ): IntegrationEvent {
    return new IntegrationEvent(
      id,
      connectionId,
      synchronizationId,
      eventType,
      entity,
      localId,
      externalId,
      httpMethod,
      endpoint,
      httpStatus,
      requestId,
      result,
      attemptNumber,
      errorSummary,
      payloadSummary,
      isProcessed,
      occurredAt
    )
  }
}
