export class MessageTemplate {
  private constructor(
    public id: number,
    public channelId: number,
    public event: string,
    public language: string,
    public subject: string | null,
    public body: string,
    public isActive: boolean
  ) {}

  static create(
    id: number,
    channelId: number,
    event: string,
    language: string,
    subject: string | null,
    body: string,
    isActive: boolean
  ): MessageTemplate {
    return new MessageTemplate(id, channelId, event, language, subject, body, isActive)
  }
}
