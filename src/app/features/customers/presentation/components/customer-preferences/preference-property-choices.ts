import { ReadResourceState } from "@/app/shared/state/read-resource"
import { Property } from "../../../domain/entities/property.entity"
import { CustomerError } from "../../../domain/errors/customer.error"

export type OwnerPropertyRead = ReadResourceState<readonly Property[], CustomerError>
export interface PreferencePropertyChoices {
  readonly items: readonly { id: number; label: string; optionLabel: string }[]
  readonly message: string
}
/** Only display-safe, verified owner options cross into the editor. No access fields. */
export function preferencePropertyChoices(
  owner: number,
  read?: OwnerPropertyRead
): PreferencePropertyChoices {
  return {
    items: read?.loaded
      ? read.data
          .filter(
            p => p.customerId === owner && Number.isInteger(p.id) && p.id > 0 && p.id <= 2147483647
          )
          .map(p => ({
            id: p.id,
            label: `${p.alias ?? p.address} · ID ${p.id}${p.isActive ? "" : " · Inactiva"}`,
            optionLabel: `${p.alias ?? p.address}${p.isActive ? "" : " · Inactiva"}`
          }))
      : [],
    message: read?.pendingReads
      ? read.loaded
        ? "Actualizando propiedades; las opciones pueden estar desactualizadas."
        : "Cargando propiedades; puedes elegir Todo el cliente."
      : read?.error
        ? read.loaded
          ? "Las opciones de propiedades pueden estar desactualizadas. Reintenta desde Propiedades."
          : "No se pudieron consultar las propiedades; puedes elegir Todo el cliente."
        : !read?.loaded
          ? "Propiedades sin verificar; puedes elegir Todo el cliente."
          : !read.data.length
            ? "No hay propiedades registradas para este cliente."
            : "Incluye propiedades inactivas del cliente."
  }
}
