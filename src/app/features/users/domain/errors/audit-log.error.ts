export type AuditLogErrorCode =
  | "INVALID_PAGINATION"
  | "INVALID_FILTER"
  | "AUDIT_LOG_NOT_FOUND"
  | "UNEXPECTED"
  | "DOWNLOAD_UNAVAILABLE"
  | "DOWNLOAD_FAILED"

export class AuditLogError extends Error {
  constructor(public readonly code: AuditLogErrorCode) {
    super(
      {
        INVALID_PAGINATION: "Paginación no válida",
        INVALID_FILTER: "Filtros no válidos",
        AUDIT_LOG_NOT_FOUND: "Registro no encontrado",
        UNEXPECTED: "No se pudo consultar la auditoría",
        DOWNLOAD_UNAVAILABLE: "Descarga no disponible",
        DOWNLOAD_FAILED: "No se pudo iniciar la descarga"
      }[code]
    )
    this.name = "AuditLogError"
  }
}
