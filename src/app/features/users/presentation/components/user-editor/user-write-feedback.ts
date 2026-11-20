import { UserErrorCode } from "../../../domain/errors/user.error"

/**
 * What the editor reports only after a confirmed write, so the page can compose the feedback
 * without guessing from refreshed rows: `created` distinguishes an alta from an edición, and the
 * customer reference is the returned `idCliente` of a CLIENTE account creation.
 */
export interface UserSavedEvent {
  readonly created: boolean
  readonly customerCreated: boolean
  readonly customerId: number | null
}

/** A failure the user can only fix in one specific input of the editor. */
export interface UserFieldError {
  readonly field: "email"
  readonly message: string
}

/**
 * Field-specific failures carry a documented marker, so they render next to the input they belong
 * to instead of in the general alert. The email is shared and unique across `usuario` and
 * `cliente`; the backend 409 is the authority, this mapping only explains it.
 */
export function userFieldError(code: UserErrorCode): UserFieldError | null {
  return code === "EMAIL_ALREADY_EXISTS"
    ? {
        field: "email",
        message:
          "El correo ya pertenece a una cuenta del portal o a un cliente, incluso si está inactivo. Usa otro correo; no se creó ni modificó nada."
      }
    : null
}

export interface UserWriteContext {
  /** The request asks the backend to create the customer row with a CLIENTE account. */
  readonly customerCreated: boolean
}

/**
 * A 403 on the CLIENTE alta is not the generic permission failure: that call needs
 * `USUARIO_CREAR` **and** `CLIENTE_CREAR`, and without the second one the backend writes nothing.
 */
export function userWriteError(code: UserErrorCode, context: UserWriteContext): string {
  if (code === "FORBIDDEN" && context.customerCreated)
    return "Crear una cuenta con rol CLIENTE también crea la ficha del cliente, así que necesita además el permiso de creación de clientes (CLIENTE_CREAR). Pide ese permiso a un administrador; no se creó nada."
  switch (code) {
    case "USER_NOT_FOUND":
      return "El usuario ya no existe. Cierra y vuelve al catálogo."
    case "PARTIAL_UPDATE":
      return "El perfil se actualizó, pero no se completó el estado o la contraseña. Revisa el catálogo antes de reintentar."
    case "FORBIDDEN":
      return "No tienes permiso para guardar estos cambios."
    case "EMAIL_ALREADY_EXISTS":
      return userFieldError(code)!.message
    default:
      return "No pudimos guardar el usuario. Inténtalo de nuevo."
  }
}

/** Toast copy for a confirmed save; only a CLIENTE alta mentions the created customer. */
export function userSavedMessage(saved?: UserSavedEvent): string {
  if (!saved?.customerCreated) return "Usuario guardado"
  return saved.customerId === null
    ? "Usuario y cliente creados"
    : `Usuario y cliente creados · Cliente #${saved.customerId}`
}
