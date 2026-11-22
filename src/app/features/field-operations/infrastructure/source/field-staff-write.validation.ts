import { HttpErrorResponse } from "@angular/common/http"
import { catchError, MonoTypeOperatorFunction } from "rxjs"
import {
  CreateFieldStaffParams,
  UpdateFieldStaffParams
} from "../../domain/params/field-operations.params"
import {
  StaffAccountFailure,
  StaffAccountFailureReason
} from "../../domain/repositories/field-operations.repository"
import { failure, positiveId } from "./field-staff-http.validation"

/**
 * Documented `PersonalRequest` body (M06/S1): the employee fields plus the access-account tri-state.
 * `crearCuenta` is omitted when the caller does not ask for a change, `password` only travels with
 * `crearCuenta: true`, and a password without that flag or a requested account without email or
 * password is refused before any HTTP. Nothing else travels — no actor, status, idUsuario or
 * availability row, and the password bytes are never trimmed.
 */
export interface StaffWriteBody {
  readonly nombre: string
  readonly documento: string
  readonly telefono: string | null
  readonly correo: string | null
  readonly idioma: string
  readonly fechaIngreso: string | null
  readonly crearCuenta?: boolean
  readonly password?: string
}

const languages = new Set(["es", "en"])
const namePattern = /^\s*\p{L}[\p{L} .'-]*$/u
const documentPattern = /^[A-Za-z0-9-]{4,30}$/
const phonePattern = /^\+?[0-9 ()-]{7,30}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const calendarPattern = /^\d{4}-\d{2}-\d{2}$/

const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max
const optional = (value: unknown, max: number) =>
  value === null || (typeof value === "string" && value.length <= max)

function calendar(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== "string" || !calendarPattern.test(value)) throw failure("INVALID_DATA")
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) throw failure("INVALID_DATA")
  return value
}

/**
 * Call-time snapshot of the caller's input. A getter, a mutated argument or an unknown shape cannot
 * change what was captured, and every documented rule is checked before any dispatch.
 */
export function staffWriteBody(
  params: CreateFieldStaffParams | UpdateFieldStaffParams
): StaffWriteBody {
  const name = params?.name,
    document = params?.document,
    phone = params?.phone ?? null,
    email = params?.email ?? null,
    language = params?.language,
    createAccount = params?.createAccount,
    password = params?.password ?? null
  if (
    typeof name !== "string" ||
    !text(name, 150) ||
    !namePattern.test(name) ||
    typeof document !== "string" ||
    !documentPattern.test(document) ||
    !optional(phone, 30) ||
    (phone !== null && !phonePattern.test(phone)) ||
    !optional(email, 120) ||
    (email !== null && email.trim().length > 0 && !emailPattern.test(email)) ||
    typeof language !== "string" ||
    !languages.has(language) ||
    (createAccount !== undefined && typeof createAccount !== "boolean") ||
    (password !== null && (typeof password !== "string" || password.length === 0))
  )
    throw failure("INVALID_DATA")
  if (createAccount === true) {
    if (password === null || email === null || email.trim().length === 0)
      throw failure("INVALID_DATA")
  } else if (password !== null) throw failure("INVALID_DATA")
  return {
    nombre: name,
    documento: document,
    telefono: phone,
    correo: email === null || email.trim().length === 0 ? null : email,
    idioma: language,
    fechaIngreso: calendar(params?.joinedOn ?? null),
    ...(createAccount === undefined ? {} : { crearCuenta: createAccount }),
    ...(createAccount === true ? { password: password! } : {})
  }
}

/** The write is addressed by the staff record it modifies, so the target is validated too. */
export function staffWriteTarget(id: unknown): number {
  if (!positiveId(id)) throw failure("INVALID_DATA")
  return id
}

/**
 * The documented conditional markers of `PersonalRequest` (`@AssertTrue` members validated by Bean
 * Validation, therefore `errores.<marker>`) plus the fixed `EMAIL_RESERVED` marker of the global
 * email uniqueness. Each one becomes its own field-specific rejection so the editor can render it
 * next to the input that has to be fixed; any other body keeps its transport status mapping and
 * server copy never reaches the UI.
 */
const markers: Readonly<Record<string, StaffAccountFailureReason>> = {
  correoParaCuenta: "ACCOUNT_EMAIL_REQUIRED",
  passwordParaCuenta: "ACCOUNT_PASSWORD_REQUIRED",
  passwordSoloConCuenta: "ACCOUNT_PASSWORD_WITHOUT_ACCOUNT"
}

const errors = (body: unknown): Record<string, unknown> | null => {
  if (!body || typeof body !== "object" || !("errores" in body)) return null
  const fields = (body as Record<string, unknown>)["errores"]
  return fields && typeof fields === "object" ? (fields as Record<string, unknown>) : null
}

export function staffAccountMarker<T>(): MonoTypeOperatorFunction<T> {
  return catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse) {
      const fields = errors(error.error)
      if (fields) {
        if (fields["correo"] === "EMAIL_RESERVED") throw new StaffAccountFailure("EMAIL_RESERVED")
        for (const [marker, reason] of Object.entries(markers))
          if (marker in fields) throw new StaffAccountFailure(reason)
      }
    }
    throw error
  })
}
