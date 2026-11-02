import { Injectable } from "@angular/core"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { ProspectOrigin } from "../../domain/entities/prospect-origin.entity"
import { FunnelStage } from "../../domain/entities/funnel-stage.entity"
import { Prospect } from "../../domain/entities/prospect.entity"
import { ProspectFollowUp } from "../../domain/entities/prospect-follow-up.entity"
import { CustomerType } from "../../domain/entities/customer.entity"
import {
  CreateProspectOriginParams,
  UpdateProspectOriginParams,
  CreateFunnelStageParams,
  UpdateFunnelStageParams,
  CreateProspectParams,
  UpdateProspectParams,
  CreateProspectFollowUpParams,
  ConvertProspectParams
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
  page
} from "./customer-http.validation"

export function originDto(v: unknown): ProspectOrigin {
  const p = record(v)
  return ProspectOrigin.create(
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
export function prospectDto(v: unknown): Prospect {
  const p = record(v)
  return Prospect.create(
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
function followUpDto(v: unknown, prospectId: number): ProspectFollowUp {
  const p = record(v)
  if (p["idProspecto"] !== prospectId) return invalid()
  return ProspectFollowUp.create(
    readId(p["idSeguimiento"]),
    prospectId,
    readId(p["idUsuario"]),
    readId(p["idEtapa"]),
    nullableText(p["comentario"]),
    date(p["fecha"])
  )
}
function originBody(p: CreateProspectOriginParams) {
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
function prospectBody(p: CreateProspectParams) {
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
  private readonly prospects = `${this.t.origin}/api/prospectos`
  listOrigins() {
    return this.t.request(
      () => this.http.get<unknown>(this.origins, { transferCache: false }),
      v => list(v, originDto)
    )
  }
  createOrigin(params: CreateProspectOriginParams) {
    const p = { ...params }
    return this.t.request(
      () => this.http.post<unknown>(this.origins, originBody(p), { transferCache: false }),
      originDto
    )
  }
  updateOrigin(params: UpdateProspectOriginParams) {
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
  listProspects(params: PaginationParams) {
    const p = { ...params }
    return this.t.request(
      () =>
        this.http.get<unknown>(this.prospects, {
          params: pagination(p.offset, p.limit),
          transferCache: false
        }),
      v => page(v, prospectDto, (p.offset ?? 0) / (p.limit ?? 20), p.limit ?? 20),
      "PROSPECT_NOT_FOUND"
    )
  }
  findProspect(prospectId: number) {
    return this.t.request(
      () => {
        input(id(prospectId))
        return this.http.get<unknown>(`${this.prospects}/${prospectId}`, { transferCache: false })
      },
      v => sameId(prospectDto(v), prospectId),
      "PROSPECT_NOT_FOUND"
    )
  }
  createProspect(params: CreateProspectParams) {
    const p = { ...params }
    return this.t.request(
      () => this.http.post<unknown>(this.prospects, prospectBody(p), { transferCache: false }),
      prospectDto,
      "PROSPECT_NOT_FOUND"
    )
  }
  updateProspect(params: UpdateProspectParams) {
    const p = { ...params }
    return this.t.request(
      () => {
        input(id(p.id))
        return this.http.put<unknown>(`${this.prospects}/${p.id}`, prospectBody(p), {
          transferCache: false
        })
      },
      v => sameId(prospectDto(v), p.id),
      "PROSPECT_NOT_FOUND"
    )
  }
  listFollowUps(prospectId: number) {
    return this.t.request(
      () => {
        input(id(prospectId))
        return this.http.get<unknown>(`${this.prospects}/${prospectId}/seguimientos`, {
          transferCache: false
        })
      },
      v => list(v, item => followUpDto(item, prospectId)),
      "PROSPECT_NOT_FOUND"
    )
  }
  addFollowUp(params: CreateProspectFollowUpParams) {
    const p = { ...params }
    return this.t.request(
      () => {
        input(id(p.prospectId) && id(p.stageId) && optional(p.comment))
        return this.http.post<unknown>(
          `${this.prospects}/${p.prospectId}/seguimientos`,
          { idEtapa: p.stageId, comentario: p.comment },
          { transferCache: false }
        )
      },
      v => followUpDto(v, p.prospectId),
      "PROSPECT_NOT_FOUND"
    )
  }
  convertProspect(params: ConvertProspectParams) {
    const p = { ...params }
    return this.t.request(
      () => {
        input(id(p.prospectId) && Object.values(CustomerType).includes(p.type))
        return this.http.post<unknown>(
          `${this.prospects}/${p.prospectId}/conversion`,
          { tipo: p.type },
          { transferCache: false }
        )
      },
      v => {
        const c = customerDto(v)
        if (c.prospectId !== p.prospectId) invalid()
        return c
      },
      "PROSPECT_NOT_FOUND"
    )
  }
}
