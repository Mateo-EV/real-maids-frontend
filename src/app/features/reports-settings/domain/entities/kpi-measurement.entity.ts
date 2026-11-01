export class KpiMeasurement {
  private constructor(
    public id: number,
    public kpiId: number,
    public periodStart: string,
    public periodEnd: string,
    public value: string,
    public calculatedAt: Date
  ) {}

  static create(
    id: number,
    kpiId: number,
    periodStart: string,
    periodEnd: string,
    value: string,
    calculatedAt: Date
  ): KpiMeasurement {
    return new KpiMeasurement(id, kpiId, periodStart, periodEnd, value, calculatedAt)
  }
}
