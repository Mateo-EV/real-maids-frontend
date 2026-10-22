import { TestBed } from "@angular/core/testing"
import { provideHttpClient } from "@angular/common/http"
import { provideHttpClientTesting, HttpTestingController } from "@angular/common/http/testing"
import { describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { UserSessionRepositoryImpl } from "./user-session.repository-impl"

describe("UserSessionRepositoryImpl", () => {
  it("delegates the root repository to real HTTP rather than the demo registry", () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" },
        { provide: USER_SESSION_REPOSITORY, useExisting: UserSessionRepositoryImpl }
      ]
    })
    const repository = TestBed.inject(USER_SESSION_REPOSITORY)
    expect(repository).toBe(TestBed.inject(UserSessionRepositoryImpl))
    const subscription = repository.getUserSessionsByUser(42).subscribe()
    const http = TestBed.inject(HttpTestingController)
    const request = http.expectOne("http://localhost:8080/api/usuarios/42/sesiones")
    expect(request.request.method).toBe("GET")
    request.flush([])
    repository.getSessionOwners({ offset: 0, limit: 5, hasSessions: false }).subscribe()
    http
      .expectOne(
        "http://localhost:8080/api/sesiones/usuarios?pagina=0&tamanio=5&tieneSesiones=false"
      )
      .flush({ contenido: [], pagina: 0, tamanio: 5, totalElementos: 0, totalPaginas: 0 })
    repository.getSessionCount().subscribe()
    http
      .expectOne("http://localhost:8080/api/sesiones?pagina=0&tamanio=1")
      .flush({ contenido: [], pagina: 0, tamanio: 1, totalElementos: 0, totalPaginas: 0 })
    http.verify()
    subscription.unsubscribe()
  })
})
