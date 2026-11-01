export class FunnelStage {
  private constructor(
    public readonly id: number,
    public readonly name: string,
    public readonly order: number,
    public readonly isFinal: boolean
  ) {}

  static create(id: number, name: string, order: number, isFinal: boolean): FunnelStage {
    return new FunnelStage(id, name, order, isFinal)
  }
}
