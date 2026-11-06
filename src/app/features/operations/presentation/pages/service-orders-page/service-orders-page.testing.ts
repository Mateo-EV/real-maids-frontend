// Synthetic wire fixtures, matching the committed order HTTP validator.
// Full non-final pages are required; never use partial pages with invented totals.
export const orderDto = (id = 17, customer = "Cliente suministrado") => ({
  idOrden: id,
  codigo: `OS-${id}`,
  estado: "PROGRAMADA",
  estadoNombre: "Estado suministrado",
  idSolicitud: null,
  idCliente: 88,
  cliente: customer,
  idPropiedad: 31,
  propiedad: "Oficina norte",
  idTipoServicio: 4,
  tipoServicio: "Limpieza profunda",
  duracionEstimadaMinutos: 90,
  montoEstimado: 1234.5,
  observacion: null,
  programacion: {
    idProgramacion: 51,
    fecha: "2024-02-29",
    horaInicio: "08:15:00.123456789",
    horaFin: "09:45:00.987654321",
    vigente: true,
    motivo: null,
    registradoPor: null,
    fechaRegistro: "2026-03-02T04:30:00-05:00"
  },
  asignados: [],
  fechaCreacion: "2026-03-02T04:30:00-05:00",
  fechaActualizacion: null
})

export const ordersDtoPage = (
  pagina = 0,
  tamanio = 20,
  totalElementos = 45,
  first = orderDto()
) => ({
  contenido: Array.from(
    { length: Math.min(tamanio, Math.max(0, totalElementos - pagina * tamanio)) },
    (_, index) => (index === 0 ? first : orderDto(1000 + index, `Cliente ${1000 + index}`))
  ),
  pagina,
  tamanio,
  totalElementos,
  totalPaginas: Math.ceil(totalElementos / tamanio)
})
