export class Permission {
  private constructor(
    public id: number,
    public code: string,
    public name: string,
    public module: string
  ) {}

  static create(id: number, code: string, name: string, module: string): Permission {
    return new Permission(id, code, name, module)
  }
}
