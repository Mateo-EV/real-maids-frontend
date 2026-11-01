/** Schema-backed safe metadata, not the current aggregate status response. */
export class QuickbooksConnection {
  private constructor(
    public id: number,
    public authorizedByUserId: number,
    public realmId: string,
    public companyName: string | null,
    public environment: string,
    public connectionStatus: string,
    public accessExpiresAt: Date | null,
    public authorizationExpiresAt: Date | null,
    public lastConnectedAt: Date | null,
    public lastSynchronizedAt: Date | null,
    public isActive: boolean,
    public createdAt: Date,
    public updatedAt: Date
  ) {}

  static create(
    id: number,
    authorizedByUserId: number,
    realmId: string,
    companyName: string | null,
    environment: string,
    connectionStatus: string,
    accessExpiresAt: Date | null,
    authorizationExpiresAt: Date | null,
    lastConnectedAt: Date | null,
    lastSynchronizedAt: Date | null,
    isActive: boolean,
    createdAt: Date,
    updatedAt: Date
  ): QuickbooksConnection {
    return new QuickbooksConnection(
      id,
      authorizedByUserId,
      realmId,
      companyName,
      environment,
      connectionStatus,
      accessExpiresAt,
      authorizationExpiresAt,
      lastConnectedAt,
      lastSynchronizedAt,
      isActive,
      createdAt,
      updatedAt
    )
  }
}
