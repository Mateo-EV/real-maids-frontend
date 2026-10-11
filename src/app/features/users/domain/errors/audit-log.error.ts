export type AuditLogErrorCode =
  | "INVALID_PAGINATION"
  | "INVALID_FILTER"
  | "INVALID_RESPONSE"
  | "AUDIT_LOG_NOT_FOUND"
  | "UNEXPECTED"
  | "NETWORK"
  | "UNCONFIGURED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "EXPORT_LIMIT"
  | "EXPORT_EMPTY"
  | "DOWNLOAD_UNAVAILABLE"
  | "DOWNLOAD_FAILED"
  | "UNSUPPORTED"

export class AuditLogError extends Error {
  constructor(public readonly code: AuditLogErrorCode) {
    super(
      {
        INVALID_PAGINATION: "Paginación no válida",
        INVALID_FILTER: "Filtros no válidos",
        INVALID_RESPONSE: "Respuesta de auditoría no válida",
        AUDIT_LOG_NOT_FOUND: "Registro no encontrado",
        UNEXPECTED: "No se pudo consultar la auditoría",
        NETWORK: "No se pudo conectar con el servidor",
        UNCONFIGURED: "API de auditoría no disponible",
        UNAUTHENTICATED: "La sesión no está disponible. Inicia sesión de nuevo.",
        FORBIDDEN: "No tienes autorización para consultar la auditoría",
        EXPORT_LIMIT:
          "El servidor rechazó la exportación. Reduce los filtros: el máximo es 10000 eventos.",
        EXPORT_EMPTY: "El servidor no devolvió contenido para descargar",
        DOWNLOAD_UNAVAILABLE: "Descarga no disponible",
        DOWNLOAD_FAILED: "No se pudo iniciar la descarga",
        UNSUPPORTED: "Operación de auditoría no disponible"
      }[code]
    )
    this.name = "AuditLogError"
  }
}
