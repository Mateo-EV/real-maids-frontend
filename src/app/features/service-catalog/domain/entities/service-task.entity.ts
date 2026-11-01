export class ServiceTask {
  private constructor(
    public id: number,
    public serviceTypeId: number,
    public description: string,
    public sortOrder: number,
    public isRequired: boolean
  ) {}

  static create(
    id: number,
    serviceTypeId: number,
    description: string,
    sortOrder: number,
    isRequired: boolean
  ): ServiceTask {
    return new ServiceTask(id, serviceTypeId, description, sortOrder, isRequired)
  }
}
