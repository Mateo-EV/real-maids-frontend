export class PaymentStatus {
  private constructor(
    public id: number,
    public name: string,
    public order: number
  ) {}

  static create(id: number, name: string, order: number): PaymentStatus {
    return new PaymentStatus(id, name, order)
  }
}
