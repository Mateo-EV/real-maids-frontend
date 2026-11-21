/**
 * The documented backend policy (`PasswordSegura`): 8–64 characters with an uppercase letter, a
 * lowercase letter and a digit. Mirrored on the client so the form rejects what the backend would
 * answer with 400; the backend stays authoritative.
 */
export const PASSWORD_POLICY_MESSAGE =
  "Usa de 8 a 64 caracteres, con mayúscula, minúscula y número."

export function passwordPolicyMessage(password: string): string | null {
  const valid =
    password.length >= 8 &&
    password.length <= 64 &&
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(password)
  return valid ? null : PASSWORD_POLICY_MESSAGE
}
