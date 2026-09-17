export type AuthErrorCode = 'INVALID_CREDENTIALS' | 'UNEXPECTED';

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthError';
  }
}
