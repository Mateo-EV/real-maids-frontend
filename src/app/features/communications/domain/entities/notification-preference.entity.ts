export class NotificationPreference {
  private constructor(
    public id: number,
    public customerId: number,
    public channelId: number,
    public language: string,
    public isEnabled: boolean
  ) {}

  static create(
    id: number,
    customerId: number,
    channelId: number,
    language: string,
    isEnabled: boolean
  ): NotificationPreference {
    return new NotificationPreference(id, customerId, channelId, language, isEnabled)
  }
}
