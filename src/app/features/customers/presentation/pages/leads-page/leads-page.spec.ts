import { PLATFORM_ID, DestroyRef, getDebugNode } from "@angular/core"
import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { TestBed } from "@angular/core/testing"
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router"
import { BehaviorSubject, of, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import {
  CreateLeadUseCase,
  DeleteLeadUseCase,
  ListFunnelStagesUseCase,
  ListLeadOriginsUseCase,
  ListLeadsUseCase
} from "../../../application/use-cases/acquisition.use-cases"
import { FunnelStage } from "../../../domain/entities/funnel-stage.entity"
import { LeadOrigin } from "../../../domain/entities/lead-origin.entity"
import { Lead } from "../../../domain/entities/lead.entity"
import { CustomerError } from "../../../domain/errors/customer.error"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"
import { LeadDeleteDialog } from "../../components/lead-delete-dialog/lead-delete-dialog"
import { LeadsPage } from "./leads-page"

type PageResult = Result<PaginationResponse<Lead>, CustomerError>
const lead = (id = 7, name = "Prospecto de prueba", converted = false) =>
  Lead.create(
    id,
    11,
    12,
    name,
    "lead@example.test",
    "555 0100",
    null,
    null,
    converted,
    new Date(0),
    null
  )
const row = lead()
const page = (items: Lead[] = [row], total = 45, offset = 0, limit = 20): PageResult =>
  Result.success({ items, total, offset, limit })

type CatalogResult<T> = Result<readonly T[], CustomerError>

function setup(server = false, query: Record<string, string> = {}) {
  const requests: Subject<PageResult>[] = []
  const originRequests: Subject<CatalogResult<LeadOrigin>>[] = []
  const stageRequests: Subject<CatalogResult<FunnelStage>>[] = []
  const execute = vi.fn(() => {
    const response = new Subject<PageResult>()
    requests.push(response)
    return response
  })
  const loadOrigins = vi.fn(() => {
    const response = new Subject<CatalogResult<LeadOrigin>>()
    originRequests.push(response)
    return response
  })
  const loadStages = vi.fn(() => {
    const response = new Subject<CatalogResult<FunnelStage>>()
    stageRequests.push(response)
    return response
  })
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "identity@example.test", null, Date.now() + 600000, 7)
  )
  const dialogRef = { open: true, close: vi.fn() }
  const openDialog = vi.fn((_component: unknown, _config: unknown) => dialogRef)
  const toast = vi.fn()
  const createRequests: Subject<Result<Lead, CustomerError>>[] = []
  const createLead = vi.fn(() => {
    const response = new Subject<Result<Lead, CustomerError>>()
    createRequests.push(response)
    return response
  })
  TestBed.configureTestingModule({
    imports: [LeadsPage],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(query) } }
      },
      { provide: HotToastService, useValue: { success: toast } },
      { provide: HlmDialogService, useValue: { open: openDialog } },
      { provide: ListLeadsUseCase, useValue: { execute } },
      { provide: CreateLeadUseCase, useValue: { execute: createLead } },
      { provide: ListLeadOriginsUseCase, useValue: { execute: loadOrigins } },
      { provide: ListFunnelStagesUseCase, useValue: { execute: loadStages } },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const fixture = TestBed.createComponent(LeadsPage)
  fixture.detectChanges()
  const element = fixture.nativeElement as HTMLElement
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const respond = async (value: PageResult) => {
    requests.at(-1)!.next(value)
    requests.at(-1)!.complete()
    await settle()
  }
  const respondOrigins = async (value: CatalogResult<LeadOrigin>) => {
    originRequests.at(-1)!.next(value)
    originRequests.at(-1)!.complete()
    await settle()
  }
  const respondStages = async (value: CatalogResult<FunnelStage>) => {
    stageRequests.at(-1)!.next(value)
    stageRequests.at(-1)!.complete()
    await settle()
  }
  const click = async (label: string) => {
    const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(
      item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  return {
    fixture,
    element,
    execute,
    requests,
    originRequests,
    stageRequests,
    loadOrigins,
    loadStages,
    openDialog,
    toast,
    createLead,
    createRequests,
    session,
    respond,
    respondOrigins,
    respondStages,
    click,
    settle
  }
}

afterEach(() => vi.restoreAllMocks())

describe("LeadsPage read-only inbox", () => {
  it("starts at 0/20 with unverified loading, then verified empty and the shared filter row", async () => {
    const s = setup()
    expect(s.execute).toHaveBeenCalledExactlyOnceWith({ offset: 0, limit: 20 })
    expect(s.element.textContent).toContain("Cargando prospectos")
    expect(s.element.textContent).not.toContain("No hay prospectos")
    await s.respond(page([], 0))
    expect(s.element.textContent).toContain("No hay prospectos")
    expect(s.element.querySelector("app-crm-catalog-navigation")).toBeNull()
    expect(s.element.querySelector("input#lead-filter-search")).not.toBeNull()
    expect(
      s.element.querySelector("select#lead-filter-origin, select#lead-filter-stage")
    ).not.toBeNull()
    expect(s.element.querySelector("app-catalog-frame a")).toBeNull()
    expect(
      s.element.querySelector("app-catalog-frame header [catalogControls]")?.textContent
    ).toContain("Crear prospecto")
    expect(s.element.textContent).not.toMatch(/Editar|Convertir|Seguimiento/)
  })

  it("restores only validated paging from the route and never reads filters from the URL", () => {
    const s = setup(false, {
      offset: "20",
      limit: "5",
      search: "Ana",
      originId: "11",
      converted: "true"
    })
    expect(s.execute).toHaveBeenCalledExactlyOnceWith({ offset: 20, limit: 5 })
    expect(s.element.querySelector<HTMLInputElement>("#lead-filter-search")!.value).toBe("")
  })

  it("renders the shared filter row with distinct labeled controls and verified catalog options", async () => {
    const s = setup()
    await s.respondOrigins(
      Result.success([
        LeadOrigin.create(11, "Formulario web", null, true),
        LeadOrigin.create(13, "Feria", null, false)
      ])
    )
    await s.respondStages(
      Result.success([
        FunnelStage.create(12, "Contactado", 1, false),
        FunnelStage.create(14, "Cerrado", 2, true)
      ])
    )
    const row = s.element.querySelector("app-catalog-filters")!
    expect(row).not.toBeNull()
    expect(row.querySelector("label[for=lead-filter-search]")?.textContent).toContain(
      "Buscar nombre, correo o teléfono"
    )
    const search = row.querySelector<HTMLInputElement>("#lead-filter-search")!
    expect(search.getAttribute("type")).toBe("search")
    expect(search.placeholder).toBe("Buscar nombre, correo o teléfono…")
    const origin = row.querySelector<HTMLSelectElement>("select#lead-filter-origin")!
    expect(origin.getAttribute("aria-label") ?? "").not.toBe("lead-filter-stage")
    expect(row.querySelector("label[for=lead-filter-origin]")?.textContent).toContain("Origen")
    expect([...origin.options].map(option => option.textContent?.trim())).toEqual([
      "Todos los orígenes",
      "Formulario web · Activo",
      "Feria · Inactivo"
    ])
    const stage = row.querySelector<HTMLSelectElement>("select#lead-filter-stage")!
    expect(row.querySelector("label[for=lead-filter-stage]")?.textContent).toContain("Etapa")
    expect([...stage.options].map(option => option.textContent?.trim())).toEqual([
      "Todas las etapas",
      "Contactado",
      "Cerrado · Final"
    ])
    const converted = row.querySelector<HTMLSelectElement>("select#lead-filter-converted")!
    expect(row.querySelector("label[for=lead-filter-converted]")?.textContent).toContain(
      "Conversión"
    )
    expect(
      [...converted.options].map(option => [option.value, option.textContent?.trim()])
    ).toEqual([
      ["", "Todos"],
      ["false", "No convertido"],
      ["true", "Convertido"]
    ])
    expect(row.querySelector("button")?.textContent).toContain("Crear prospecto")
  })

  it("debounces search, applies selects immediately, resets offset and retains the effective limit", async () => {
    const s = setup()
    await s.respond(page([row], 45, 0, 5))
    await s.respondOrigins(Result.success([LeadOrigin.create(11, "Formulario web", null, true)]))
    await s.respondStages(Result.success([FunnelStage.create(12, "Contactado", 1, false)]))
    await s.click("Página siguiente")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 5, limit: 5 })
    const search = s.element.querySelector<HTMLInputElement>("#lead-filter-search")!
    search.value = "  Ana Pérez  "
    search.dispatchEvent(new Event("input", { bubbles: true }))
    await s.settle()
    expect(s.execute).toHaveBeenCalledTimes(2)
    await new Promise(resolve => setTimeout(resolve, 275))
    await s.settle()
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 0, limit: 5, search: "Ana Pérez" })
    const origin = s.element.querySelector<HTMLSelectElement>("#lead-filter-origin")!
    origin.value = "11"
    origin.dispatchEvent(new Event("change", { bubbles: true }))
    expect(s.execute).toHaveBeenLastCalledWith({
      offset: 0,
      limit: 5,
      search: "Ana Pérez",
      originId: 11
    })
    await s.settle()
    const stage = s.element.querySelector<HTMLSelectElement>("#lead-filter-stage")!
    stage.value = "12"
    stage.dispatchEvent(new Event("change", { bubbles: true }))
    expect(s.execute).toHaveBeenLastCalledWith({
      offset: 0,
      limit: 5,
      search: "Ana Pérez",
      originId: 11,
      stageId: 12
    })
    await s.settle()
    const converted = s.element.querySelector<HTMLSelectElement>("#lead-filter-converted")!
    converted.value = "true"
    converted.dispatchEvent(new Event("change", { bubbles: true }))
    expect(s.execute).toHaveBeenLastCalledWith({
      offset: 0,
      limit: 5,
      search: "Ana Pérez",
      originId: 11,
      stageId: 12,
      converted: true
    })
    await s.settle()
  })

  it("keeps filters out of lead detail return URLs while preserving effective paging", async () => {
    const s = setup()
    const converted = s.element.querySelector<HTMLSelectElement>("#lead-filter-converted")!
    converted.value = "false"
    converted.dispatchEvent(new Event("change", { bubbles: true }))
    await s.settle()
    await s.respond(page())
    const detail = s.element.querySelector<HTMLAnchorElement>(
      'a[aria-label="Ver detalle de Prospecto de prueba"]'
    )!
    const params = new URL(detail.href).searchParams
    expect([...params.keys()]).toEqual(["offset", "limit"])
    expect(params.get("offset")).toBe("0")
    expect(params.get("limit")).toBe("20")
  })

  it("renders a filtered empty state whose reset restores the unfiltered listing", async () => {
    const s = setup()
    await s.respondOrigins(Result.success([LeadOrigin.create(11, "Formulario web", null, true)]))
    const origin = s.element.querySelector<HTMLSelectElement>("#lead-filter-origin")!
    origin.value = "11"
    origin.dispatchEvent(new Event("change", { bubbles: true }))
    await s.settle()
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 0, limit: 20, originId: 11 })
    await s.respond(page([], 0))
    expect(s.element.textContent).toContain("Sin prospectos para esos filtros")
    expect(s.element.textContent).toContain("Prueba otra búsqueda o restablece los filtros.")
    expect(s.element.textContent).not.toContain("No hay prospectos")
    await s.click("Restablecer filtros")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 0, limit: 20 })
  })

  it("renders actual lead fields and converted state in container-responsive records with working detail links", async () => {
    const s = setup()
    await s.respond(page([row, lead(8, "Convertido real", true)]))
    await s.respondOrigins(
      Result.success([LeadOrigin.create(11, "<b>Recomendación</b>", null, true)])
    )
    await s.respondStages(Result.success([FunnelStage.create(12, "Contactado", 1, false)]))
    const frame = s.element.querySelector("app-catalog-frame")!
    expect(
      frame.querySelector('section[aria-labelledby="leads-title"]')?.getAttribute("aria-busy")
    ).toBe("false")
    expect(frame.querySelector("header h1")?.textContent).toContain("Bandeja de Prospectos")
    expect(frame.querySelector("[catalogDesktop] table")).not.toBeNull()
    expect(frame.querySelector("ul[catalogMobile]")).not.toBeNull()
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const records = frame.querySelector(selector)!
      expect(records.textContent).toContain(row.name)
      expect(records.textContent).toContain(row.email)
      expect(records.textContent).toContain(row.phone)
      expect(records.textContent).toContain("Convertido")
      expect(records.textContent).toContain("No convertido")
      expect(records.textContent).toContain("<b>Recomendación</b>")
      expect(records.querySelector("b")).toBeNull()
      expect(records.textContent).toContain("Contactado")
      expect(records.textContent).not.toContain("11")
      expect(records.textContent).not.toContain("12")
      expect(records.querySelectorAll("a")).toHaveLength(2)
      expect(records.querySelector("a")?.getAttribute("href")).toBe(
        "/admin/customers/leads/7?offset=0&limit=20"
      )
      // Only the non-converted row offers the delete action in each layout.
      expect(records.querySelectorAll("button")).toHaveLength(1)
    }
    expect(frame.querySelector("th")?.textContent).toBe("Nombre")
    expect(frame.textContent).toContain("Origen")
    expect(frame.textContent).toContain("Etapa")
    expect(frame.textContent).not.toContain("Origen (ID)")
    expect(frame.textContent).not.toContain("Etapa (ID)")
    expect(frame.textContent).not.toContain("Cliente vinculado")
  })

  it("uses the wider local editor dialog width", async () => {
    const s = setup()
    await s.click("Crear prospecto")
    expect(s.openDialog).toHaveBeenCalledOnce()
    expect(s.openDialog.mock.calls[0][1]).toMatchObject({ contentClass: "sm:max-w-2xl" })
  })

  it("offers the delete action only on non-converted rows with an accessible name on both layouts", async () => {
    const s = setup()
    await s.respond(page([row, lead(8, "Convertido real", true)]))
    const desktop = s.element.querySelector("[catalogDesktop]")!
    expect([...desktop.querySelectorAll("th")].map(th => th.textContent?.trim())).toContain(
      "Acciones"
    )
    const tableRows = [...desktop.querySelectorAll("tbody tr")]
    expect(tableRows).toHaveLength(2)
    const openAction = tableRows[0].querySelector("button")!
    expect(openAction.getAttribute("aria-label")).toBe("Eliminar prospecto Prospecto de prueba")
    expect(openAction.textContent).toContain("Eliminar")
    expect(tableRows[1].querySelector("button")).toBeNull()
    const cards = [...s.element.querySelectorAll("[catalogMobile] li")]
    expect(cards).toHaveLength(2)
    expect(cards[0].querySelector("button")?.getAttribute("aria-label")).toBe(
      "Eliminar prospecto Prospecto de prueba"
    )
    expect(cards[1].querySelector("button")).toBeNull()
    // The converted row keeps its own labels untouched, without a hidden second action.
    expect(tableRows[1].textContent).toContain("Convertido")
    expect(s.element.textContent).not.toContain("Eliminar prospecto Convertido real")
  })

  it("opens one confirmation dialog for the captured lead and emits feedback only from its confirmed callback", async () => {
    const s = setup()
    await s.respond(page([row]))
    await s.click("Eliminar prospecto Prospecto de prueba")
    expect(s.openDialog).toHaveBeenCalledOnce()
    const config = s.openDialog.mock.calls[0][1] as {
      context: {
        lead: Lead
        owner: unknown
        current: () => boolean
        onDeleted: () => void
      }
    }
    expect(s.openDialog.mock.calls[0][0]).toBe(LeadDeleteDialog)
    expect(config).toMatchObject({ showCloseButton: false, disableClose: true })
    expect(config.context.lead).toBe(row)
    expect(config.context.owner).toBeInstanceOf(DestroyRef)
    expect(config.context.current()).toBe(true)
    await s.click("Eliminar prospecto Prospecto de prueba")
    expect(s.openDialog).toHaveBeenCalledOnce()
    expect(s.toast).not.toHaveBeenCalled()
    config.context.onDeleted()
    expect(s.toast).toHaveBeenCalledExactlyOnceWith("Prospecto eliminado correctamente.")
  })

  it("does not open the confirmation while another lead write is pending", async () => {
    const s = setup()
    await s.respond(page([row]))
    TestBed.inject(CustomerAcquisitionStore)
      .createLead({
        originId: 11,
        stageId: 12,
        name: "Pendiente",
        email: null,
        phone: null,
        referenceAddress: null,
        observation: null
      })
      .subscribe()
    await s.settle()
    expect(s.fixture.componentInstance.writing()).toBe(true)
    expect(
      s.element.querySelector<HTMLButtonElement>(
        "button[aria-label='Eliminar prospecto Prospecto de prueba']"
      )!.disabled
    ).toBe(true)
    s.fixture.componentInstance.deleteLead(row)
    await s.settle()
    expect(s.openDialog).not.toHaveBeenCalled()
  })

  it("preserves null contacts as unregistered without fabricating metadata or interpreting text", async () => {
    const s = setup()
    const value = Lead.create(
      9,
      31,
      42,
      "<b>Nombre literal</b>",
      null,
      null,
      null,
      null,
      false,
      new Date(0),
      null
    )
    await s.respond(page([value]))
    expect(s.element.textContent).toContain("<b>Nombre literal</b>")
    expect(s.element.querySelector("b")).toBeNull()
    expect(s.element.querySelector("[catalogDesktop]")?.textContent).toContain("No registrado")
    expect(s.element.querySelector("[catalogMobile]")?.textContent).toContain("No registrado")
    expect(s.element.textContent).not.toContain("Cliente vinculado")
    expect(s.execute).toHaveBeenCalledTimes(1)
  })

  it("loads origin and stage catalogs independently and labels references without N+1 reads", async () => {
    const s = setup()
    expect(s.loadOrigins).toHaveBeenCalledOnce()
    expect(s.loadStages).toHaveBeenCalledOnce()
    expect(s.element.textContent).toContain("Cargando orígenes")
    expect(s.element.textContent).toContain("Cargando etapas")
    await s.respond(page([row, lead(8, "Otro prospecto")]))
    await s.respondOrigins(Result.success([LeadOrigin.create(11, "Formulario web", null, true)]))
    await s.respondStages(Result.success([FunnelStage.create(12, "Por contactar", 1, false)]))
    expect(s.element.textContent).toContain("Formulario web")
    expect(s.element.textContent).toContain("Por contactar")
    expect(s.element.textContent).not.toMatch(/(?:Origen|Etapa)\s*:?\s*(?:11|12)\b/)
    expect(s.loadOrigins).toHaveBeenCalledTimes(1)
    expect(s.loadStages).toHaveBeenCalledTimes(1)
  })

  it("shows honest missing-reference labels and independent retryable catalog errors without hiding leads", async () => {
    const s = setup()
    await s.respond(page([row]))
    await s.respondOrigins(Result.failure(new CustomerError("NETWORK")))
    await s.respondStages(Result.success([FunnelStage.create(99, "Nueva etapa", 1, false)]))
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.textContent).toContain("Origen no disponible")
    expect(s.element.textContent).toContain("Etapa no disponible")
    expect(s.element.textContent).toContain("No se pudieron cargar los orígenes")
    expect(s.element.textContent).not.toContain("11")
    expect(s.element.textContent).not.toContain("12")
    await s.click("Reintentar orígenes")
    expect(s.loadOrigins).toHaveBeenCalledTimes(2)
    await s.respondOrigins(Result.success([LeadOrigin.create(11, "Referencia", null, false)]))
    expect(s.element.textContent).toContain("Referencia")
    expect(s.element.textContent).toContain(row.name)
    expect(s.loadStages).toHaveBeenCalledTimes(1)
  })

  it("uses effective offset/limit, server total and ranges for next/previous, not local slicing", async () => {
    const s = setup()
    await s.respond(page([row], 45, 0, 5))
    expect(s.element.textContent).toContain("1–1 de 45 prospectos")
    expect(
      s.element.querySelector<HTMLButtonElement>('button[aria-label="Página anterior"]')!.disabled
    ).toBe(true)
    await s.click("Página siguiente")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 5, limit: 5 })
    await s.respond(page([row], 45, 2, 2))
    expect(s.element.textContent).toContain("3–3 de 45 prospectos")
    expect(
      s.element.querySelector('app-table-pagination [aria-current="page"]')?.textContent?.trim()
    ).toBe("2")
    await s.click("Página siguiente")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 4, limit: 2 })
    await s.respond(page([row], 45, 4, 2))
    await s.click("Página anterior")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 2, limit: 2 })
  })

  it("shows safe retryable errors without false empty, and retries the failed query", async () => {
    const s = setup()
    await s.respond(Result.failure(new CustomerError("FORBIDDEN")))
    expect(s.element.querySelector('[role="alert"]')?.textContent).toContain("No tienes permiso")
    expect(s.element.textContent).not.toContain("No hay prospectos")
    await s.click("Reintentar")
    expect(s.execute).toHaveBeenCalledTimes(2)
    await s.respond(page())
    await s.click("Página siguiente")
    expect(s.element.textContent).not.toContain(row.name)
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element.textContent).not.toContain(row.name)
    await s.click("Reintentar")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 20, limit: 20 })
  })

  it("reuses fresh pages, keeps only same-query stale rows on expired revisit and failed retries", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = setup()
    await s.respond(page())
    await s.click("Página siguiente")
    await s.respond(page([lead(8, "Otra página")], 45, 20))
    await s.click("Página anterior")
    expect(s.execute).toHaveBeenCalledTimes(2)
    await s.click("Página siguiente")
    clock.mockReturnValue(31000)
    await s.click("Página anterior")
    expect(s.execute).toHaveBeenCalledTimes(3)
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.textContent).not.toContain("Otra página")
    expect(s.element.textContent).toContain("Actualizando prospectos")
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element.textContent).toContain("desactualizados")
    await s.click("Reintentar")
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.textContent).toContain("Actualizando prospectos")
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.textContent).toContain("desactualizados")
  })

  it("corrects positive-total out-of-range emptiness once per navigation/retry with the effective limit", async () => {
    const s = setup()
    await s.respond(page([row], 100))
    await s.click("Página 5")
    await s.respond(page([], 7, 20, 5))
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 5, limit: 5 })
    expect(s.execute).toHaveBeenCalledTimes(3)
    await s.respond(page([], 3, 5, 5))
    expect(s.execute).toHaveBeenCalledTimes(3)
    expect(s.element.textContent).toContain("Esta página ya no tiene registros")
    expect(s.element.textContent).not.toContain("No hay prospectos")
    await s.click("Reintentar")
    await s.respond(page([], 3, 5, 5))
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 0, limit: 5 })
    expect(s.execute).toHaveBeenCalledTimes(5)
  })

  it("does not recover verified zero-total pages", async () => {
    const s = setup()
    await s.respond(page())
    await s.click("Página siguiente")
    await s.respond(page([], 0, 20))
    expect(s.execute).toHaveBeenCalledTimes(2)
    expect(s.element.textContent).toContain("No hay prospectos")
  })

  it("shares the root read with another consumer and releases only its own subscription on destruction", () => {
    const s = setup()
    const other = TestBed.inject(CustomerAcquisitionStore)
      .observeLeads({ offset: 0, limit: 20 })
      .subscribe()
    expect(s.execute).toHaveBeenCalledTimes(1)
    s.fixture.destroy()
    expect(s.requests[0].observed).toBe(true)
    other.unsubscribe()
    expect(s.requests[0].observed).toBe(false)
  })

  it("cancels obsolete queries and ignores late results on destruction", async () => {
    const s = setup()
    await s.respond(page())
    await s.click("Página siguiente")
    const pending = s.requests[1]
    s.fixture.destroy()
    expect(pending.observed).toBe(false)
    pending.next(page([lead(9, "Obsoleto")]))
    expect(
      TestBed.inject(CustomerAcquisitionStore).selectLeads({ offset: 20, limit: 20 })().data
    ).toBeUndefined()
  })

  it.each(["logout", "replacement"])(
    "clears and fences pending reads on %s, preserving same-session renewal",
    async change => {
      const s = setup()
      await s.respond(page())
      const current = s.session.value!
      s.session.next(
        AuthSession.create(current.name, current.email, current.role, current.expiresAt, current.id)
      )
      await s.settle()
      expect(s.element.textContent).toContain(row.name)
      await s.click("Página siguiente")
      const pending = s.requests[1]
      s.session.next(
        change === "logout"
          ? null
          : AuthSession.create("Other", "other@example.test", null, current.expiresAt, 8)
      )
      await s.settle()
      expect(pending.observed).toBe(false)
      pending.next(page())
      await s.settle()
      expect(s.element.textContent).not.toContain(row.name)
      expect(s.execute).toHaveBeenCalledTimes(2)
    }
  )

  it("fences a queued recovery if the session changes before its microtask", async () => {
    const s = setup()
    s.requests[0].next(page([], 7, 20, 5))
    s.requests[0].complete()
    s.session.next(AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8))
    await s.settle()
    expect(s.execute).toHaveBeenCalledTimes(1)
  })

  it("cancels an expired background read when navigating to another query", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = setup()
    await s.respond(page())
    await s.click("Página siguiente")
    await s.respond(page([lead(8, "Otra página")], 45, 20))
    clock.mockReturnValue(31000)
    await s.click("Página anterior")
    const obsolete = s.requests[2]
    expect(obsolete.observed).toBe(true)
    await s.click("Página siguiente")
    expect(obsolete.observed).toBe(false)
    obsolete.next(page([lead(9, "Respuesta obsoleta")]))
    await s.settle()
    expect(s.element.textContent).toContain("Otra página")
    expect(s.element.textContent).not.toContain("Respuesta obsoleta")
  })

  it("does not run queued recovery after destruction", async () => {
    const s = setup()
    s.requests[0].next(page([], 7, 20, 5))
    s.fixture.destroy()
    await Promise.resolve()
    expect(s.execute).toHaveBeenCalledTimes(1)
  })

  it("releases catalog reads when the page is destroyed", () => {
    const s = setup()
    expect(s.originRequests[0].observed).toBe(true)
    expect(s.stageRequests[0].observed).toBe(true)
    s.fixture.destroy()
    expect(s.originRequests[0].observed).toBe(false)
    expect(s.stageRequests[0].observed).toBe(false)
  })

  it("releases catalog reads when the session is replaced", async () => {
    const s = setup()
    s.session.next(AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8))
    await s.settle()
    expect(s.originRequests[0].observed).toBe(false)
    expect(s.stageRequests[0].observed).toBe(false)
  })

  it("does not dispatch lead or catalog reads during SSR", () => {
    const s = setup(true)
    expect(s.execute).not.toHaveBeenCalled()
    expect(s.loadOrigins).not.toHaveBeenCalled()
    expect(s.loadStages).not.toHaveBeenCalled()
  })

  it("renders no CRM tabs, KPI block, catalog tables or duplicated CRM navigation", async () => {
    const s = setup()
    await s.respond(page([row], 45))
    await s.respondOrigins(
      Result.success([LeadOrigin.create(11, "Formulario web", "Sitio web", true)])
    )
    await s.respondStages(Result.success([FunnelStage.create(12, "Contactado", 1, false)]))
    expect(s.element.querySelector("app-crm-catalog-navigation")).toBeNull()
    expect(s.element.querySelector(".catalog-metrics")).toBeNull()
    expect(s.element.querySelector('nav[aria-label="Secciones de prospectos"]')).toBeNull()
    expect(
      s.element.querySelectorAll("[data-prospects-tab], [data-origins-tab], [data-stages-tab]")
    ).toHaveLength(0)
    expect(s.element.textContent).not.toContain("Resumen del catálogo")
    expect(s.element.querySelectorAll("app-catalog-frame")).toHaveLength(1)
    expect(
      s.element.querySelector('app-catalog-frame section[aria-labelledby="leads-title"]')
    ).not.toBeNull()
    expect(s.element.querySelector("#lead-origins-title, #lead-stages-title")).toBeNull()
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.querySelector("input#lead-filter-search")).not.toBeNull()
  })
})

function deletionSetup() {
  const requests: Subject<PageResult>[] = []
  const deletions: Subject<Result<void, CustomerError>>[] = []
  const list = vi.fn(() => {
    const response = new Subject<PageResult>()
    requests.push(response)
    return response
  })
  const remove = vi.fn(() => {
    const response = new Subject<Result<void, CustomerError>>()
    deletions.push(response)
    return response
  })
  const toast = vi.fn()
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "identity@example.test", null, Date.now() + 600000, 7)
  )
  TestBed.configureTestingModule({
    imports: [LeadsPage],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap({}) } }
      },
      { provide: HotToastService, useValue: { success: toast } },
      { provide: ListLeadsUseCase, useValue: { execute: list } },
      { provide: DeleteLeadUseCase, useValue: { execute: remove } },
      { provide: ListLeadOriginsUseCase, useValue: { execute: () => of(Result.success([])) } },
      { provide: ListFunnelStagesUseCase, useValue: { execute: () => of(Result.success([])) } },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } }
    ]
  })
  const fixture = TestBed.createComponent(LeadsPage)
  fixture.detectChanges()
  const element = fixture.nativeElement as HTMLElement
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const dialog = () => document.querySelector<HTMLElement>("app-lead-delete-dialog")
  const respond = async (value: PageResult) => {
    requests.at(-1)!.next(value)
    requests.at(-1)!.complete()
    await settle()
  }
  const click = async (label: string, within: ParentNode = element) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  const respondDeletion = async (value: Result<void, CustomerError>) => {
    deletions.at(-1)!.next(value)
    deletions.at(-1)!.complete()
    await settle()
  }
  return {
    fixture,
    element,
    dialog,
    respond,
    respondDeletion,
    click,
    settle,
    list,
    remove,
    deletions,
    toast,
    session
  }
}

describe("LeadsPage lead deletion confirmation", () => {
  it("identifies the captured prospecto, warns about irreversibility and blocks pending duplicates/dismissal", async () => {
    const s = deletionSetup()
    await s.settle()
    await s.respond(page([row]))
    await s.click("Eliminar prospecto Prospecto de prueba")
    const panel = s.dialog()!
    expect(panel).not.toBeNull()
    expect(panel.textContent).toContain("Prospecto de prueba")
    expect(panel.textContent).toContain("#7")
    expect(panel.textContent).toContain("irreversible")
    expect(panel.textContent!.replace(/\s+/g, " ")).toContain(
      "Sólo los prospectos no convertidos pueden eliminarse"
    )
    await s.click("Confirmar eliminación", panel)
    expect(s.remove).toHaveBeenCalledExactlyOnceWith(7)
    const cdk = getDebugNode(panel)!.injector.get(CdkDialogRef)
    expect([...panel.querySelectorAll("button")].every(button => button.disabled)).toBe(true)
    panel.querySelectorAll("button")[1].dispatchEvent(new MouseEvent("click", { bubbles: true }))
    cdk.overlayRef.backdropElement!.click()
    document.body.click()
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }))
    await s.settle()
    expect(s.dialog()).toBe(panel)
    expect(s.remove).toHaveBeenCalledOnce()
    expect(s.toast).not.toHaveBeenCalled()
    await s.respondDeletion(Result.success(undefined))
    expect(s.dialog()).toBeNull()
    expect(s.toast).toHaveBeenCalledExactlyOnceWith("Prospecto eliminado correctamente.")
    // The already observed inbox revalidates once through store invalidation, never locally.
    expect(s.list).toHaveBeenCalledTimes(2)
    expect(s.remove).toHaveBeenCalledOnce()
  })

  it("keeps the dialog open with safe actionable server refusals and allows an explicit retry", async () => {
    const s = deletionSetup()
    await s.settle()
    await s.respond(page([row]))
    await s.click("Eliminar prospecto Prospecto de prueba")
    await s.click("Confirmar eliminación", s.dialog()!)
    const raw = new CustomerError("CONFLICT")
    raw.message = "RAW_PRIVATE_VALUE"
    await s.respondDeletion(Result.failure(raw))
    expect(s.dialog()).not.toBeNull()
    expect(s.dialog()!.querySelector("[role=alert]")).not.toBeNull()
    expect(s.dialog()!.textContent).toContain("convertido")
    expect(s.dialog()!.textContent).not.toContain("RAW_PRIVATE_VALUE")
    expect(s.toast).not.toHaveBeenCalled()
    expect(s.list).toHaveBeenCalledOnce()
    await s.click("Confirmar eliminación", s.dialog()!)
    expect(s.remove).toHaveBeenCalledTimes(2)
    await s.respondDeletion(Result.failure(new CustomerError("LEAD_NOT_FOUND")))
    expect(s.dialog()!.textContent).toContain("ya no está disponible")
    expect(s.toast).not.toHaveBeenCalled()
    expect(s.remove).toHaveBeenCalledTimes(2)
  })

  it("cancels and fences a pending deletion when the session is replaced", async () => {
    const s = deletionSetup()
    await s.settle()
    await s.respond(page([row]))
    await s.click("Eliminar prospecto Prospecto de prueba")
    await s.click("Confirmar eliminación", s.dialog()!)
    expect(s.deletions[0].observed).toBe(true)
    s.session.next(AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8))
    await s.settle()
    expect(s.dialog()).toBeNull()
    expect(s.deletions[0].observed).toBe(false)
    await s.respondDeletion(Result.success(undefined))
    expect(s.toast).not.toHaveBeenCalled()
    expect(s.list).toHaveBeenCalledOnce()
  })
})
