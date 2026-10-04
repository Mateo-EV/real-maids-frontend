export class Role {
  private constructor(
    public id: number,
    public name: string,
    public description: string,
    public isActive: boolean,
    public createdAt: Date
  ) {}

  static create(id: number, name: string, description: string, isActive: boolean, createdAt: Date): Role {
    return new Role(id, name, description, isActive, createdAt)
  }
}
