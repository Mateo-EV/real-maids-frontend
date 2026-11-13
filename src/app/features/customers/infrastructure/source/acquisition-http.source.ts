import { apiConflictContext } from "@/app/core/http/api-conflict-context"
import { CheckLeadEmailParams, LeadEmailCheck } from "../../domain/params/lead-email.params"
import { reservedCustomerEmail } from "./customer-email-conflict"
import { Injectable } from "@angular/core"
import { LeadListQuery } from "../../domain/models/lead-list-query"
import { ProspectoEstadisticas } from "../../domain/params/prospecto-estadisticas.params"
import { LeadOrigin } from "../../domain/entities/lead-origin.entity"
import { FunnelStage } from "../../domain/entities/funnel-stage.entity"
import { Lead } from "../../domain/entities/lead.entity"
import { LeadFollowUp } from "../../domain/entities/lead-follow-up.entity"
import { CustomerType } from "../../domain/entities/customer.entity"
import {
  CreateLeadOriginParams,
  UpdateLeadOriginParams,
  CreateFunnelStageParams,
  UpdateFunnelStageParams,
  CreateLeadParams,
  UpdateLeadParams,
  CreateLeadFollowUpParams,
  ConvertLeadParams
} from "../../domain/params/acquisition.params"
import { customerTransport } from "./customer-http.transport"
import { customerDto } from "./customer-http.source"
import {
  record,
  readId,
  nullableId,
  text,
  nullableText,
  flag,
  date,
  sameId,
  list,
  input,
  id,
  required,
  email,
  optional,
  invalid,
  pagination,
  page,
  integer
} from "./customer-http.validation"

export function originDto(v: unknown): LeadOrigin {
  const p = record(v)
  return LeadOrigin.create(
    readId(p["idOrigen"]),
    text(p["nombre"], 60),
    nullableText(p["descripcion"], 150),
    flag(p["activo"])
  )
}
export function stageDto(v: unknown): FunnelStage {
  const p = record(v),
    order = p["orden"]
  if (
    typeof order !== "number" ||
    !Number.isInteger(order) ||
    order < -2147483648 ||
    order > 2147483647
  )
    return invalid()
  return FunnelStage.create(readId(p["idEtapa"]), text(p["nombre"], 50), order, flag(p["esFinal"]))
}
export function leadDto(v: unknown): Lead {
  const p = record(v)
  return Lead.create(
    readId(p["idProspecto"]),
    readId(p["idOrigen"]),
    readId(p["idEtapa"]),
    text(p["nombre"], 120),
    nullableText(p["correo"], 120),
    nullableText(p["telefono"], 30),
    nullableText(p["direccionReferencia"], 200),
    nullableText(p["observacion"]),
    flag(p["convertido"]),
    date(p["fechaRegistro"]),
    nullableId(p["usuarioRegistro"])
  )
}
function followUpDto(v: unknown, leadId: number): LeadFollowUp {
  const p = record(v)
  if (p["idProspecto"] !== leadId) return invalid()
  return LeadFollowUp.create(
    readId(p["idSeguimiento"]),
    leadId,
    readId(p["idUsuario"]),
    readId(p["idEtapa"]),
    nullableText(p["comentario"]),
    date(p["fecha"])
  )
}
/** Server counts are nonnegative integers; no cross-count arithmetic is asserted here. */
function count(v: unknown): number {
  return integer(v) ? v : invalid()
}
export function statisticsDto(v: unknown): ProspectoEstadisticas {
  const p = record(v)
  return {
    total: count(p["total"]),
    convertidos: count(p["convertidos"]),
    pendientes: count(p["pendientes"])
  }
}
function originBody(p: CreateLeadOriginParams) {
  input(required(p.name, 60) && optional(p.description, 150) && typeof p.isActive === "boolean")
  return { nombre: p.name, descripcion: p.description, activo: p.isActive }
}
function stageBody(p: CreateFunnelStageParams) {
  input(
    required(p.name, 50) &&
      Number.isInteger(p.order) &&
      p.order >= -2147483648 &&
      p.order <= 2147483647 &&
      typeof p.isFinal === "boolean"
  )
  return { nombre: p.name, orden: p.order, esFinal: p.isFinal }
}
function leadBody(p: CreateLeadParams) {
  input(
    id(p.originId) &&
      id(p.stageId) &&
      required(p.name, 120) &&
      email(p.email) &&
      optional(p.phone, 30) &&
      optional(p.referenceAddress, 200) &&
      optional(p.observation)
  )
  return {
    idOrigen: p.originId,
    idEtapa: p.stageId,
    nombre: p.name,
    correo: p.email,
    telefono: p.phone,
    direccionReferencia: p.referenceAddress,
    observacion: p.observation
  }
}
@Injectable({ providedIn: "root" })
export class AcquisitionHttpSource {
  private readonly t = customerTransport()
  private readonly http = this.t.http
  private readonly origins = `${this.t.origin}/api/catalogos/origenes-prospecto`
  private readonly stages = `${this.t.origin}/api/catalogos/etapas-embudo`
  private readonly leads = `${this.t.origin}/api/prospectos`
  checkLeadEmail(params: CheckLeadEmailParams) {
    const p = { ...params }
    return this.t.request(
      () => {
        input(
          required(p.email, 120) &&
            email(p.email) &&
            (p.excludeLeadId === undefined || id(p.excludeLeadId))
        )
        return this.http.post<unknown>(
          `${this.leads}/validacion-correo`,
          {
            correo: p.email,
            ...(p.excludeLeadId === undefined ? {} : { idProspectoExcluir: p.excludeLeadId })
          },
          { transferCache: false }
        )
      },
      (v): LeadEmailCheck => {
        const dto = record(v)
        return {
          customerExists: flag(dto["clienteExistente"]),
          leadExists: flag(dto["prospectoExistente"])
        }
      }
    )
  }
  listOrigins() {
    return this.t.request(
      () => this.http.get<unknown>(this.origins, { transferCache: false }),
      v => list(v, originDto)
    )
  }
  createOrigin(params: CreateLeadOriginParams) {
    const p = { ...params }
    return this.t.request(
      () => this.http.post<unknown>(this.origins, originBody(p), { transferCache: false }),
      originDto
    )
  }
  updateOrigin(params: UpdateLeadOriginParams) {
    const p = { ...params }
    return this.t.request(
      () => {
        input(id(p.id))
        return this.http.put<unknown>(`${this.origins}/${p.id}`, originBody(p), {
          transferCache: false
        })
      },
      v => sameId(originDto(v), p.id)
    )
  }
  listStages() {
    return this.t.request(
      () => this.http.get<unknown>(this.stages, { transferCache: false }),
      v => list(v, stageDto)
    )
  }
  createStage(params: CreateFunnelStageParams) {
    const p = { ...params }
    return this.t.request(
      () => this.http.post<unknown>(this.stages, stageBody(p), { transferCache: false }),
      stageDto
    )
  }
  updateStage(params: UpdateFunnelStageParams) {
    const p = { ...params }
    return this.t.request(
      () => {
        input(id(p.id))
        return this.http.put<unknown>(`${this.stages}/${p.id}`, stageBody(p), {
          transferCache: false
        })
      },
      v => sameId(stageDto(v), p.id)
    )
  }
  listLeads(params: LeadListQuery) {
    const p = { ...params }
    return this.t.request(
      () =>
        this.http.get<unknown>(this.leads, {
          // Blank filters are omitted and malformed ids are never sent; paging is unchanged.
          params: {
            ...pagination(p.offset, p.limit),
            ...(p.search?.trim() ? { busqueda: p.search.trim() } : {}),
            ...(id(p.originId) ? { idOrigen: p.originId } : {}),
            ...(id(p.stageId) ? { idEtapa: p.stageId } : {}),
            ...(typeof p.converted === "boolean" ? { convertido: p.converted } : {})
          },
          transferCache: false
        }),
      v => page(v, leadDto, (p.offset ?? 0) / (p.limit ?? 20), p.limit ?? 20),
      "LEAD_NOT_FOUND"
    )
  }
  getLeadStatistics() {
    return this.t.request(
      () => this.http.get<unknown>(`${this.leads}/estadisticas`, { transferCache: false }),
      statisticsDto
    )
  }
  findLead(leadId: number) {
    return this.t.request(
      () => {
        input(id(leadId))
        return this.http.get<unknown>(`${this.leads}/${leadId}`, { transferCache: false })
      },
      v => sameId(leadDto(v), leadId),
      "LEAD_NOT_FOUND"
    )
  }
  createLead(params: CreateLeadParams) {
    const p = { ...params }
    return this.t.request(
      () => this.http.post<unknown>(this.leads, leadBody(p), { transferCache: false }),
      leadDto,
      "LEAD_NOT_FOUND"
    )
  }
  updateLead(params: UpdateLeadParams) {
    const p = { ...params }
    return this.t.request(
      () => {
        input(id(p.id) && (p.comentarioSeguimiento === null || required(p.comentarioSeguimiento)))
        return this.http.put<unknown>(
          `${this.leads}/${p.id}`,
          { ...leadBody(p), comentarioSeguimiento: p.comentarioSeguimiento },
          { transferCache: false }
        )
      },
      v => sameId(leadDto(v), p.id),
      "LEAD_NOT_FOUND"
    )
  }
  /** Frozen physical delete: no body, no payload; 204 alone confirms it. */
  deleteLead(leadId: number) {
    return this.t.request(
      () => {
        input(id(leadId))
        return this.http.delete<unknown>(`${this.leads}/${leadId}`, { transferCache: false })
      },
      () => undefined,
      "LEAD_NOT_FOUND"
    )
  }
  listFollowUps(leadId: number) {
    return this.t.request(
      () => {
        input(id(leadId))
        return this.http.get<unknown>(`${this.leads}/${leadId}/seguimientos`, {
          transferCache: false
        })
      },
      v => list(v, item => followUpDto(item, leadId)),
      "LEAD_NOT_FOUND"
    )
  }
  addFollowUp(params: CreateLeadFollowUpParams) {
    const p = { ...params }
    return this.t.request(
      () => {
        input(id(p.leadId) && id(p.stageId) && optional(p.comment))
        return this.http.post<unknown>(
          `${this.leads}/${p.leadId}/seguimientos`,
          { idEtapa: p.stageId, comentario: p.comment },
          { transferCache: false }
        )
      },
      v => followUpDto(v, p.leadId),
      "LEAD_NOT_FOUND"
    )
  }
  convertLead(params: ConvertLeadParams) {
    const p = { ...params }
    return this.t.request(
      () => {
        input(id(p.leadId) && Object.values(CustomerType).includes(p.type))
        return this.http
          .post<unknown>(
            `${this.leads}/${p.leadId}/conversion`,
            { tipo: p.type },
            { transferCache: false, context: apiConflictContext() }
          )
          .pipe(reservedCustomerEmail())
      },
      v => {
        const c = customerDto(v)
        if (c.leadId !== p.leadId) invalid()
        return c
      },
      "LEAD_NOT_FOUND"
    )
  }
}
