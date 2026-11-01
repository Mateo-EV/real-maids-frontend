export class PaymentMethod {
  private constructor(
    public id: number,
    public customerId: number,
    public type: string,
    public lastDigits: string | null,
    public isDefault: boolean,
    public isActive: boolean,
    public registeredAt: Date
  ) {}

  static create(
    id: number,
    customerId: number,
    type: string,
    lastDigits: string | null,
    isDefault: boolean,
    isActive: boolean,
    registeredAt: Date
  ): PaymentMethod {
    return new PaymentMethod(id, customerId, type, lastDigits, isDefault, isActive, registeredAt)
  }
}
