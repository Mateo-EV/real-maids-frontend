import { AuditFieldChange } from "../models/audit-query"

export class AuditLog {
  private constructor(
    public id: number,
    public userId: number,
    public entity: string,
    public action: string,
    public details: string,
    public ip: string,
    public date: Date,
    public actor: string,
    public recordId: string,
    public changes?: readonly AuditFieldChange[]
  ) {}

  static create(
    id: number,
    userId: number,
    entity: string,
    action: string,
    details: string,
    ip: string,
    date: Date,
    actor = `Usuario ${userId}`,
    recordId = String(id),
    changes?: readonly AuditFieldChange[]
  ): AuditLog {
    return new AuditLog(id, userId, entity, action, details, ip, date, actor, recordId, changes)
  }
}
