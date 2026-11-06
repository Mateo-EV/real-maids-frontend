/** Synthetic wire responses confined to the new detail consumer's tests. */
export const orderDetailApi = "https://api.example.test/api/ordenes"
export const sessionDeadline = 4102444800000
export const accessText = "<b>SYNTHETIC ACCESS INSTRUCTION</b>"
export const doorText = "<b>SYNTHETIC DOOR CODE</b>"
const instant = "2026-03-02T04:30:00-05:00"

export const scheduleDto = (id = 51) => ({
  idProgramacion: id,
  fecha: "2024-02-29",
  horaInicio: "08:15:00.123456789",
  horaFin: "10:45:00.987654321" as string | null,
  vigente: true,
  motivo: "Motivo suministrado" as string | null,
  registradoPor: "Planificadora suministrada" as string | null,
  fechaRegistro: instant
})

export const orderDetailDto = (id = 17) => ({
  orden: {
    idOrden: id,
    codigo: `OS-DET-${id}`,
    estado: "PROGRAMADA",
    estadoNombre: "Estado suministrado",
    idSolicitud: 42 as number | null,
    idCliente: 8,
    cliente: "Cliente suministrado",
    idPropiedad: 31,
    propiedad: "Propiedad suministrada",
    idTipoServicio: 4,
    tipoServicio: "Servicio suministrado",
    duracionEstimadaMinutos: 90,
    montoEstimado: 0 as number | null,
    observacion: "  <b>Observación literal</b>\nhttps://example.test  " as string | null,
    programacion: scheduleDto() as ReturnType<typeof scheduleDto> | null,
    asignados: [
      {
        idPersonal: 21,
        nombre: "Personal suministrado",
        telefono: null as string | null,
        rol: "RESPONSABLE"
      },
      {
        idPersonal: 22,
        nombre: "Segundo personal",
        telefono: "555-0100" as string | null,
        rol: "APOYO_NUEVO"
      }
    ],
    fechaCreacion: instant,
    fechaActualizacion: null as string | null
  },
  propiedad: {
    idPropiedad: 31,
    idCliente: 8,
    alias: "Alias suministrado" as string | null,
    direccion: "Dirección suministrada",
    ciudad: "Ciudad suministrada" as string | null,
    estadoRegion: "Región suministrada" as string | null,
    codigoPostal: "33101" as string | null,
    areaM2: 12.5 as number | null,
    numeroAmbientes: 0 as number | null,
    numeroBanos: 0 as number | null,
    instruccionesAcceso: accessText as string | null,
    codigoPuerta: doorText as string | null,
    tieneMascotas: false,
    activo: false,
    fechaCreacion: instant
  },
  historial: [
    {
      estado: "PROGRAMADA",
      estadoNombre: "Historia primera",
      usuario: "Actor primero",
      observacion: null as string | null,
      fecha: instant
    },
    {
      estado: "PENDIENTE",
      estadoNombre: "Historia segunda",
      usuario: "Actor segundo",
      observacion: "" as string | null,
      fecha: "2026-03-01T10:00:00Z"
    }
  ],
  programaciones: [
    scheduleDto(52),
    {
      ...scheduleDto(51),
      fecha: "2024-02-28",
      vigente: false,
      motivo: null,
      registradoPor: null,
      horaFin: null
    }
  ]
})
