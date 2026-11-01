export type SatisfactionRating = 1 | 2 | 3 | 4 | 5

export class SatisfactionSurvey {
  private constructor(
    public id: number,
    public orderId: number,
    public customerId: number,
    public rating: SatisfactionRating,
    public comment: string | null,
    public createdAt: Date
  ) {}

  static create(
    id: number,
    orderId: number,
    customerId: number,
    rating: SatisfactionRating,
    comment: string | null,
    createdAt: Date
  ): SatisfactionSurvey {
    return new SatisfactionSurvey(id, orderId, customerId, rating, comment, createdAt)
  }
}
