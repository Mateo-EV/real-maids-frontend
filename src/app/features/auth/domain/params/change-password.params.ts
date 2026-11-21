/**
 * Own password change (`PUT /api/auth/me/password`). The backend requires the current password,
 * closes the other sessions, keeps the current one and clears `debeCambiarPassword`.
 *
 * Password bytes are sent exactly as typed: they are never trimmed, logged or persisted by the
 * frontend.
 */
export interface ChangePasswordParams {
  readonly currentPassword: string
  readonly newPassword: string
}
