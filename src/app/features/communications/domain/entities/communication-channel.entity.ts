export class CommunicationChannel {
  private constructor(
    public id: number,
    public name: string,
    public isActive: boolean
  ) {}

  static create(id: number, name: string, isActive: boolean): CommunicationChannel {
    return new CommunicationChannel(id, name, isActive)
  }
}
