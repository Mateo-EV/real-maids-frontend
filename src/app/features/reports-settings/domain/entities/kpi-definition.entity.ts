export class KpiDefinition {
  private constructor(
    public id: number,
    public name: string,
    public description: string | null,
    public formula: string | null,
    public unit: string | null,
    public target: string | null,
    public frequency: string | null,
    public isActive: boolean
  ) {}

  static create(
    id: number,
    name: string,
    description: string | null,
    formula: string | null,
    unit: string | null,
    target: string | null,
    frequency: string | null,
    isActive: boolean
  ): KpiDefinition {
    return new KpiDefinition(id, name, description, formula, unit, target, frequency, isActive)
  }
}
