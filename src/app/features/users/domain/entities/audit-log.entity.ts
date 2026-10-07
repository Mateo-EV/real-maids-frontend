export class AuditLog {
  private constructor(
    public id: number,
    public userId: number,
    public entity: string,
    public action: string,
    public details: string,
    public ip: string,
    public date: Date
  ) {}

  static create(
    id: number,
    userId: number,
    entity: string,
    action: string,
    details: string,
    ip: string,
    date: Date
  ): AuditLog {
    return new AuditLog(id, userId, entity, action, details, ip, date)
  }
}
