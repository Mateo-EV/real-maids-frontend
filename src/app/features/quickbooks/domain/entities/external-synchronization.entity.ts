export class ExternalSynchronization {
  private constructor(
    public id: string,
    public connectionId: number,
    public localEntity: string,
    public localId: string,
    public quickbooksEntity: string,
    public externalId: string,
    public direction: string,
    public status: string,
    public attemptCount: number,
    public lastSynchronizedAt: Date | null,
    public lastErrorSummary: string | null,
    public createdAt: Date,
    public updatedAt: Date
  ) {}

  static create(
    id: string,
    connectionId: number,
    localEntity: string,
    localId: string,
    quickbooksEntity: string,
    externalId: string,
    direction: string,
    status: string,
    attemptCount: number,
    lastSynchronizedAt: Date | null,
    lastErrorSummary: string | null,
    createdAt: Date,
    updatedAt: Date
  ): ExternalSynchronization {
    return new ExternalSynchronization(
      id,
      connectionId,
      localEntity,
      localId,
      quickbooksEntity,
      externalId,
      direction,
      status,
      attemptCount,
      lastSynchronizedAt,
      lastErrorSummary,
      createdAt,
      updatedAt
    )
  }
}
