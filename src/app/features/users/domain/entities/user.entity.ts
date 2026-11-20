export enum Lang {
  EN = "en",
  ES = "es"
}

export class User {
  private constructor(
    public id: number,
    public name: string,
    public email: string,
    public lang: Lang,
    public isActive: boolean,
    public createdAt: Date,
    public updatedAt: Date,
    public roleId: number,
    public lastAccess: Date | null,
    // Customer row created together with a CLIENTE account (wire `idCliente`); null when unlinked.
    // Absent in responses that predate the shared customer/account contract, never fabricated.
    public customerId: number | null = null
  ) {}

  static create(
    id: number,
    name: string,
    email: string,
    lang: Lang,
    isActive: boolean,
    createdAt: Date,
    updatedAt: Date,
    roleId: number,
    lastAccess: Date | null = null,
    customerId: number | null = null
  ): User {
    return new User(
      id,
      name,
      email,
      lang,
      isActive,
      createdAt,
      updatedAt,
      roleId,
      lastAccess,
      customerId
    )
  }
}
