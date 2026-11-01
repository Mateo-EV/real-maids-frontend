export class CustomerContact {
  private constructor(
    public readonly id: number,
    public readonly customerId: number,
    public readonly name: string,
    public readonly position: string | null,
    public readonly email: string | null,
    public readonly phone: string | null,
    public readonly isPrimary: boolean,
    public readonly isActive: boolean
  ) {}

  static create(
    id: number,
    customerId: number,
    name: string,
    position: string | null,
    email: string | null,
    phone: string | null,
    isPrimary: boolean,
    isActive: boolean
  ): CustomerContact {
    return new CustomerContact(id, customerId, name, position, email, phone, isPrimary, isActive)
  }
}
