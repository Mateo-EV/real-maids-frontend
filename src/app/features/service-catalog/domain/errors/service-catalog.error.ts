export type ServiceCatalogErrorCode =
  "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID_DATA" | "UNAVAILABLE" | "UNKNOWN"

export class ServiceCatalogError extends Error {
  constructor(
    public readonly code: ServiceCatalogErrorCode,
    message: string
  ) {
    super(message)
    this.name = "ServiceCatalogError"
  }
}
