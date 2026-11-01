export interface CreateServiceCategoryParams {
  name: string
  description: string | null
  isActive: boolean
}
export interface UpdateServiceCategoryParams {
  name: string
  description: string | null
  isActive: boolean
}
export interface CreateServiceTypeParams {
  categoryId: number
  name: string
  description: string | null
  estimatedDurationMinutes: number
  isActive: boolean
}
export interface UpdateServiceTypeParams {
  categoryId: number
  name: string
  description: string | null
  estimatedDurationMinutes: number
  isActive: boolean
}
export interface CreateServiceFrequencyParams {
  name: string
  intervalDays: number
  isActive: boolean
}
export interface UpdateServiceFrequencyParams {
  name: string
  intervalDays: number
  isActive: boolean
}
export interface CreateServiceRateParams {
  serviceTypeId: number
  frequencyId: number | null
  price: string
  currency: string
  validFrom: string
  validUntil: string | null
  isActive: boolean
}
export interface UpdateServiceRateParams {
  serviceTypeId: number
  frequencyId: number | null
  price: string
  currency: string
  validFrom: string
  validUntil: string | null
  isActive: boolean
}
export interface CreateAdditionalServiceParams {
  name: string
  description: string | null
  price: string
  extraDurationMinutes: number | null
  isActive: boolean
}
export interface UpdateAdditionalServiceParams {
  name: string
  description: string | null
  price: string
  extraDurationMinutes: number | null
  isActive: boolean
}
export interface CreateServiceTaskParams {
  description: string
  sortOrder: number
  isRequired: boolean
}
export interface UpdateServiceTaskParams {
  description: string
  sortOrder: number
  isRequired: boolean
}
