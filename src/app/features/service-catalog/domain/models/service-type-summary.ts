// Confirmed catalog projection; SQL-only active state is not supplied by this response.
export interface ServiceTypeSummary {
  id: number
  name: string
  description: string | null
  estimatedDurationMinutes: number
  categoryId: number
  categoryName: string
}
