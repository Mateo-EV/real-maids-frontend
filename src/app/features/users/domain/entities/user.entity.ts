export enum Lang {
  EN = "en",
  ES = "es"
}

export class User {
  private constructor(
    public id: number,
    public name: string,
    public age: number,
    public email: string,
    public lang: Lang,
    public isActive: boolean,
    public createdAt: Date,
    public updatedAt: Date,
    public roleId: number,
    public lastAccess: Date | null
  ) {}

  static create(
    id: number,
    name: string,
    age: number,
    email: string,
    lang: Lang,
    isActive: boolean,
    createdAt: Date,
    updatedAt: Date,
    roleId: number,
    lastAccess: Date | null = null
  ): User {
    return new User(id, name, age, email, lang, isActive, createdAt, updatedAt, roleId, lastAccess)
  }
}
