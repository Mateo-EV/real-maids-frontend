export class SupportStatus {
  private constructor(
    public id: number,
    public name: string,
    public order: number,
    public isFinal: boolean
  ) {}

  static create(id: number, name: string, order: number, isFinal: boolean): SupportStatus {
    return new SupportStatus(id, name, order, isFinal)
  }
}
