import { Observable, Subscriber } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { OperationsError } from "../../domain/errors/operations.error"
import { AgendaEntry } from "../../domain/models/operations-read.models"
import { AgendaQuery } from "../../domain/params/operations.params"

export const agendaEntry = (orderId = 17, date = "2024-02-29"): AgendaEntry => ({
  date,
  startTime: "08:15:49.123456789",
  endTime: null,
  orderId,
  code: `OS-${orderId}`,
  status: "PROGRAMADA",
  customerName: "Cliente suministrado",
  propertyName: "Oficina suministrada",
  serviceTypeName: null,
  assignedStaff: [{ staffId: 9, name: "Personal suministrado", phone: null, role: "responsable" }]
})
export const agendaDto = (orderId = 17, date = "2024-02-29") => ({
  fecha: date,
  horaInicio: "08:15:49.123456789",
  horaFin: null,
  idOrden: orderId,
  codigo: `OS-${orderId}`,
  estado: "PROGRAMADA",
  cliente: "Cliente suministrado",
  propiedad: "Oficina suministrada",
  tipoServicio: null,
  asignados: [
    { idPersonal: 9, nombre: "Personal suministrado", telefono: null, rol: "responsable" }
  ]
})
export class AgendaCall {
  cancelled = false
  settled = false
  constructor(
    readonly query: AgendaQuery,
    private readonly subscriber: Subscriber<Result<AgendaEntry[], OperationsError>>
  ) {}
  succeed(entries: AgendaEntry[]) {
    this.settled = true
    this.subscriber.next(Result.success(entries))
    this.subscriber.complete()
  }
  fail() {
    this.settled = true
    this.subscriber.next(Result.failure(new OperationsError("FORBIDDEN", "Safe failure")))
    this.subscriber.complete()
  }
  throwError() {
    this.settled = true
    this.subscriber.error(new Error("Private transport detail"))
  }
  empty() {
    this.settled = true
    this.subscriber.complete()
  }
}
export class ControlledAgenda {
  readonly calls: AgendaCall[] = []
  execute(query: AgendaQuery): Observable<Result<AgendaEntry[], OperationsError>> {
    return new Observable(subscriber => {
      const call = new AgendaCall({ ...query }, subscriber)
      this.calls.push(call)
      return () => {
        if (!call.settled) call.cancelled = true
      }
    })
  }
  latest(): AgendaCall {
    const call = this.calls.at(-1)
    if (!call) throw new Error("Expected an agenda subscription")
    return call
  }
}
