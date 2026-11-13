/**
 * Frozen backend aggregate for GET /api/clientes/estadisticas (authority CLIENTE_LEER).
 * The counts are server-owned: they are never derived from a loaded page or from each other.
 */
export interface ClienteEstadisticas {
  readonly total: number
  readonly activos: number
  readonly inactivos: number
}
