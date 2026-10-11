import { AuditFieldChange } from "../models/audit-query"

export class AuditLog {
  private constructor(
    public id: number,
    public userId: number | null,
    public entity: string,
    public action: string,
    public details: string | null,
    public ip: string | null,
    public date: Date,
    public actor: string | null,
    public recordId: string | null,
    public changes?: readonly AuditFieldChange[],
    public actorEmail?: string | null
  ) {}

  static create(
    id: number,
    userId: number | null,
    entity: string,
    action: string,
    details: string | null,
    ip: string | null,
    date: Date,
    actor: string | null = `Usuario ${userId}`,
    recordId: string | null = String(id),
    changes?: readonly AuditFieldChange[],
    actorEmail?: string | null
  ): AuditLog {
    return new AuditLog(
      id,
      userId,
      entity,
      action,
      details,
      ip,
      date,
      actor,
      recordId,
      changes,
      actorEmail
    )
  }
}
