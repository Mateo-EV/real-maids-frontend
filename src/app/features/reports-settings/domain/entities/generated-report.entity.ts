export class GeneratedReport {
  private constructor(
    public id: number,
    public userId: number,
    public type: string,
    public parameters: string | null,
    public format: string,
    public generatedAt: Date
  ) {}

  static create(
    id: number,
    userId: number,
    type: string,
    parameters: string | null,
    format: string,
    generatedAt: Date
  ): GeneratedReport {
    return new GeneratedReport(id, userId, type, parameters, format, generatedAt)
  }
}
