export class OrderStatus {
  private constructor(
    public id: number,
    public name: string,
    public sortOrder: number,
    public isFinal: boolean
  ) {}

  static create(id: number, name: string, sortOrder: number, isFinal: boolean): OrderStatus {
    return new OrderStatus(id, name, sortOrder, isFinal)
  }
}
