export class LandingSection {
  private constructor(
    public id: number,
    public key: string,
    public name: string,
    public order: number,
    public isVisible: boolean
  ) {}

  static create(
    id: number,
    key: string,
    name: string,
    order: number,
    isVisible: boolean
  ): LandingSection {
    return new LandingSection(id, key, name, order, isVisible)
  }
}
