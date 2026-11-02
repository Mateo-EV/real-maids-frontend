import { TestBed } from "@angular/core/testing"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom } from "rxjs"
import { describe, it, expect } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { CustomerRepositoryImpl } from "../repositories/customer.repository-impl"

export const customerDto = {
  idCliente: 7,
  nombre: "Customer",
  tipo: "residencial",
  correo: null,
  telefono: null,
  activo: true,
  idUsuario: 11,
  fechaCreacion: "2026-01-01T12:00:00-05:00",
  fechaActualizacion: null,
  idProspecto: 3,
  identificacionFiscal: "Tax",
  sistemaOrigen: "Legacy",
  idExterno: "external-9",
  usuarioRegistro: 12
}

describe("Customer real HTTP boundary", () => {
  it("reads the active-only unpaged server list and preserves real metadata", async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" }
      ]
    })
    const pending = firstValueFrom(TestBed.inject(CustomerRepositoryImpl).findAll())
    const http = TestBed.inject(HttpTestingController)
    const request = http.expectOne("http://localhost:8080/api/clientes")
    expect(request.request.method).toBe("GET")
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.transferCache).toBe(false)
    request.flush([customerDto])
    expect(await pending).toMatchObject({
      success: true,
      data: [
        {
          id: 7,
          userId: 11,
          prospectId: 3,
          taxIdentification: "Tax",
          systemOrigin: "Legacy",
          externalId: "external-9",
          registeredByUserId: 12,
          updatedAt: null,
          createdAt: new Date("2026-01-01T17:00:00Z")
        }
      ]
    })
    http.verify()
  })
})
