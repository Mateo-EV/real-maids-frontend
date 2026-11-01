export class MigrationRecord {
  private constructor(
    public id: number,
    public entity: string,
    public sourceSystem: string,
    public externalId: string,
    public internalId: number,
    public observation: string | null,
    public migratedAt: Date
  ) {}

  static create(
    id: number,
    entity: string,
    sourceSystem: string,
    externalId: string,
    internalId: number,
    observation: string | null,
    migratedAt: Date
  ): MigrationRecord {
    return new MigrationRecord(
      id,
      entity,
      sourceSystem,
      externalId,
      internalId,
      observation,
      migratedAt
    )
  }
}
