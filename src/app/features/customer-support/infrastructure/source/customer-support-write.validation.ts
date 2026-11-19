import { dtoRecord } from "@/app/shared/infrastructure/http/dto-validation"
import {
  AddSupportMessageParams,
  ChangeSupportStateParams,
  CreateSupportRequestParams
} from "../../domain/params/customer-support.params"
import { failure, positiveId } from "./customer-support-http.validation"

// Documented wire limits. Over-limit input is refused, never silently truncated.
export const SUPPORT_SUBJECT_MAX_LENGTH = 150
export const SUPPORT_TEXT_MAX_LENGTH = 4000

const invalidInput = (): never => {
  throw failure("VALIDATION")
}
const body = (value: unknown) => dtoRecord(value, invalidInput)

// Text leaves the client trimmed; the caller's bytes are otherwise preserved.
function requiredText(value: unknown, max: number): string {
  if (typeof value !== "string") return invalidInput()
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > max) return invalidInput()
  return trimmed
}

// A wire code has no documented length limit; the backend owns the accepted vocabulary.
function requiredCode(value: unknown): string {
  if (typeof value !== "string") return invalidInput()
  const trimmed = value.trim()
  if (trimmed.length === 0) return invalidInput()
  return trimmed
}

// An optional text is omitted when absent or blank, never sent as an empty value.
function optionalText(value: unknown, max: number): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value !== "string") return invalidInput()
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed.length > max) return invalidInput()
  return trimmed
}

// Call-time capture of the documented inputs only; an unknown or hostile params
// object becomes VALIDATION inside the deferred dispatch instead of a synchronous throw.
function capture<T extends object>(
  params: T,
  read: (source: T) => Record<string, unknown>
): unknown {
  try {
    if (!params || typeof params !== "object" || Array.isArray(params)) return null
    return read(params)
  } catch {
    return null
  }
}

export const captureCreateRequest = (params: CreateSupportRequestParams): unknown =>
  capture(params, source => ({
    customerId: source.customerId,
    orderId: source.orderId,
    requestTypeId: source.requestTypeId,
    subject: source.subject,
    description: source.description
  }))

export const captureAddMessage = (params: AddSupportMessageParams): unknown =>
  capture(params, source => ({ message: source.message }))

export const captureChangeState = (params: ChangeSupportStateParams): unknown =>
  capture(params, source => ({ state: source.state, message: source.message }))

/**
 * POST /api/atenciones body. `idCliente` is required for staff and stays null for the
 * own-customer audience the backend resolves from the session; `idOrden` is optional.
 */
export function createSupportRequestBody(value: unknown) {
  const p = body(value)
  const customerId = p["customerId"],
    orderId = p["orderId"],
    requestTypeId = p["requestTypeId"]
  if (
    !(customerId === null || positiveId(customerId)) ||
    !(orderId === null || orderId === undefined || positiveId(orderId)) ||
    !positiveId(requestTypeId)
  )
    return invalidInput()
  return {
    idCliente: customerId,
    ...(orderId === null || orderId === undefined ? {} : { idOrden: orderId }),
    idTipo: requestTypeId,
    asunto: requiredText(p["subject"], SUPPORT_SUBJECT_MAX_LENGTH),
    descripcion: requiredText(p["description"], SUPPORT_TEXT_MAX_LENGTH)
  }
}

/** POST /api/atenciones/{id}/seguimiento body: only the message. */
export function followUpRequestBody(value: unknown) {
  const p = body(value)
  return { mensaje: requiredText(p["message"], SUPPORT_TEXT_MAX_LENGTH) }
}

/**
 * PATCH /api/atenciones/{id}/estado body. The state is sent as the caller asked for:
 * which targets are allowed, and for which transitions, is the backend's authority.
 */
export function changeStateRequestBody(value: unknown) {
  const p = body(value)
  const estado = requiredCode(p["state"])
  const mensaje = optionalText(p["message"], SUPPORT_TEXT_MAX_LENGTH)
  return { estado, ...(mensaje === undefined ? {} : { mensaje }) }
}
