export class LandingContent {
  private constructor(
    public id: number,
    public sectionId: number,
    public language: string,
    public title: string | null,
    public body: string | null,
    public imageUrl: string | null,
    public isPublished: boolean,
    public updatedAt: Date | null,
    public registeredByUserId: number | null
  ) {}

  static create(
    id: number,
    sectionId: number,
    language: string,
    title: string | null,
    body: string | null,
    imageUrl: string | null,
    isPublished: boolean,
    updatedAt: Date | null,
    registeredByUserId: number | null
  ): LandingContent {
    return new LandingContent(
      id,
      sectionId,
      language,
      title,
      body,
      imageUrl,
      isPublished,
      updatedAt,
      registeredByUserId
    )
  }
}
