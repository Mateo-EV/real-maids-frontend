export class FieldStaff {
  private constructor(
    public id: number,
    public userId: number | null,
    public accountEmail: string | null,
    public name: string,
    public document: string,
    public phone: string | null,
    public email: string | null,
    public language: string,
    public joinedOn: string | null,
    public sourceSystem: string | null,
    public externalId: string | null,
    public isActive: boolean,
    public createdAt: Date
  ) {}

  static create(
    id: number,
    userId: number | null,
    accountEmail: string | null,
    name: string,
    document: string,
    phone: string | null,
    email: string | null,
    language: string,
    joinedOn: string | null,
    sourceSystem: string | null,
    externalId: string | null,
    isActive: boolean,
    createdAt: Date
  ): FieldStaff {
    return new FieldStaff(
      id,
      userId,
      accountEmail,
      name,
      document,
      phone,
      email,
      language,
      joinedOn,
      sourceSystem,
      externalId,
      isActive,
      createdAt
    )
  }
}
