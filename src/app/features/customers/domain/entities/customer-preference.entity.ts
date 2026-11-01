export class CustomerPreference {
  private constructor(
    public readonly id: number,
    public readonly customerId: number,
    public readonly propertyId: number | null,
    public readonly type: string,
    public readonly detail: string,
    public readonly isActive: boolean
  ) {}

  static create(
    id: number,
    customerId: number,
    propertyId: number | null,
    type: string,
    detail: string,
    isActive: boolean
  ): CustomerPreference {
    return new CustomerPreference(id, customerId, propertyId, type, detail, isActive)
  }
}
