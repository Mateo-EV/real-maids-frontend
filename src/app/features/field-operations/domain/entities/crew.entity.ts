export class Crew {
  private constructor(
    public id: number,
    public name: string,
    public description: string | null,
    public isActive: boolean,
    public createdAt: Date
  ) {}

  static create(
    id: number,
    name: string,
    description: string | null,
    isActive: boolean,
    createdAt: Date
  ): Crew {
    return new Crew(id, name, description, isActive, createdAt)
  }
}
