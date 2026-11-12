/**
 * Frozen backend aggregate for GET /api/prospectos/estadisticas (authority CLIENTE_LEER).
 * The counts are server-owned: they are never derived from a loaded page or from each other.
 */
export interface ProspectoEstadisticas {
  readonly total: number
  readonly convertidos: number
  readonly pendientes: number
}
