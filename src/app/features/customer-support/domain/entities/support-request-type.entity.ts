export class SupportRequestType {
  private constructor(
    public id: number,
    public name: string,
    public requiresResponse: boolean,
    public isActive: boolean
  ) {}

  static create(
    id: number,
    name: string,
    requiresResponse: boolean,
    isActive: boolean
  ): SupportRequestType {
    return new SupportRequestType(id, name, requiresResponse, isActive)
  }
}
