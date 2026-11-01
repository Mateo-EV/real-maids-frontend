/** Confirmed PropiedadRequest fields; owner is supplied separately by the repository. */
export interface CreatePropertyParams {
  readonly alias: string | null
  readonly address: string
  readonly city: string | null
  readonly region: string | null
  readonly postalCode: string | null
  readonly areaM2: string | null
  readonly roomCount: number | null
  readonly bathroomCount: number | null
  readonly accessInstructions: string | null
  readonly doorCode: string | null
  readonly hasPets: boolean
}
export interface UpdatePropertyParams {
  readonly id: number
  readonly alias: string | null
  readonly address: string
  readonly city: string | null
  readonly region: string | null
  readonly postalCode: string | null
  readonly areaM2: string | null
  readonly roomCount: number | null
  readonly bathroomCount: number | null
  readonly accessInstructions: string | null
  readonly doorCode: string | null
  readonly hasPets: boolean
}
