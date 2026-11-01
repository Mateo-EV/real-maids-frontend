export class CrewMember {
  private constructor(
    public id: number,
    public crewId: number,
    public staffId: number,
    public role: string,
    public isActive: boolean
  ) {}

  static create(
    id: number,
    crewId: number,
    staffId: number,
    role: string,
    isActive: boolean
  ): CrewMember {
    return new CrewMember(id, crewId, staffId, role, isActive)
  }
}
