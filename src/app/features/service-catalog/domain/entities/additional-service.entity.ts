export class AdditionalService {
  private constructor(
    public id: number,
    public name: string,
    public description: string | null,
    public price: string,
    public extraDurationMinutes: number | null,
    public isActive: boolean
  ) {}

  static create(
    id: number,
    name: string,
    description: string | null,
    price: string,
    extraDurationMinutes: number | null,
    isActive: boolean
  ): AdditionalService {
    return new AdditionalService(id, name, description, price, extraDurationMinutes, isActive)
  }
}
