# Operaciones UX fase 2 — combobox de catálogos, filtros de agenda, KPIs y calendario

Segunda fase de la experiencia de Operaciones: simplifica el editor de solicitud, unifica los filtros de catálogo en un combobox con búsqueda y recarga, mueve los filtros a la cabecera en las tres secciones, agrega KPIs propios de operaciones y reemplaza la grilla de agenda.

## Specs

- S1 — El modal de **crear solicitud** deja de tener la paginación de catálogo: los selects de cliente, propiedad y tipo de servicio pasan a ser un **combobox con barra de búsqueda dentro del propio control**; la navegación de páginas, si existe, vive dentro del desplegable y no como controles sueltos debajo.
- S2 — El botón de "actualizar clientes/propiedades/tipos de servicio" ya no aparece como acción de la vista: se reemplaza por un **botón de recarga con icono dentro del combobox**, junto a la barra de búsqueda.
- S3 — **Agenda**: los filtros (fecha, vista, personal) se muestran igual que en Solicitudes y Órdenes — en la fila de la cabecera del `CatalogFrame`, al costado del título y la descripción —, no como un formulario aparte debajo.
- S4 — En Agenda el campo de personal pasa de input numérico a un **combobox con búsqueda y recarga**, igual al de las otras secciones.
- S5 — En Agenda se elimina el botón "Consultar"/"Agendar": los cambios de filtro se aplican **automáticamente** al cambiar cualquier control.
- S6 — Los selects de **cliente** en Solicitudes y Órdenes, y el de **personal** en Órdenes, pasan al mismo combobox con barra de búsqueda y recarga. Aplica a las tres secciones.
- S7 — Se agregan **KPIs de operaciones** en la página de Operaciones, como en CRM e IAM: tarjetas en el shell, hermanas del `<router-outlet />`, con datos de solicitudes, órdenes y agenda. Requiere estadísticas de backend; las cifras nunca se derivan de la página cargada.
- S8 — La vista de **Agenda** reemplaza la grilla actual por una presentación de calendario legible (mes/semana/día), con los turnos como eventos y enlace real a la orden.
- S9 — Los filtros de catálogo siguen sin inventar identidades: solo opciones reales del servidor, la búsqueda es server-side, y una selección explícita permanece visible aunque la página cargada cambie. Nada de descargar catálogos completos ni de totales locales.

## Tasks

| ID | Spec | Task |
| --- | --- | --- |
| T1 | S1–S2, S9 | Combobox reutilizable de catálogo (búsqueda server-side + recarga con icono) |
| T2 | S1–S2 | Editor de solicitud: selects → combobox, sin paginación visible |
| T3 | S3–S5 | Agenda: filtros en la cabecera, personal como combobox, aplicación automática, sin botón Consultar |
| T4 | S6 | Solicitudes y Órdenes: filtros de cliente/personal como combobox |
| T5 | S7 | Estadísticas de operaciones en backend + KPIs en el shell |
| T6 | S8 | Calendario de agenda con librería (pendiente de decisión de dependencia) |

## Log

- L1 (user, verbatim): "primero quiero simplificar el modal de l crear solicitud, el select está bien, pero me haz puesto una paginacion que es ve extraña, quitala, mejor pon un buscador dentro del mismo combobox y la opcion puede ser buena idea de que la paginacion esté dentro del combobox, el boton de actualizar clientes o propiestas o tipos de servicio, no lo considero adecuado en esta vista, prefiero un boton con un icono de recargar adentro del combobox por ejemplo a lado de la barra de búsqueda. ahora para la agenda pon los filtros como se ven en los shells de solicitudes y órdenes, ahora bien, cambia el id de personal por un combobox similar pero de personal, y posiciona los filtros como se ven en los otros shells, en la misma fila que donde dice Agenda consultas de programacion.., y quita el boton consultar agendar los cambios de filtro se aplican al cambiar los filtros automaticamente no al presionar el boton. Cambia los filtros de select por de clientes, de personal por ese combobox con barra de busqueda y reload con el icon en las vistas de solicitudes, ordenes y agenda. Agrega kpis en la pagina de operaciones como en crm y iam, proponlos tu y que sean de operaciones que incluye solicitudes, órdenes y agenda (puedes desarrollar el backend para agregar estadisticas de esto). Cambia la vista de la agenda por una liberia que permita ver mejor la agenda, pues el grid como está puesto está feo."
- L2 (authorization): el usuario autoriza explícitamente desarrollar el backend del repositorio separado (`D:\java\sistema_the_real_maids`) para agregar las estadísticas de operaciones.
- L3 (open decision): la librería de calendario es una dependencia nueva; requiere elección explícita del usuario antes de instalar.
- L4 (user decision): la vista de agenda usa **FullCalendar** (`@fullcalendar/angular` + `dayGrid` + `timeGrid`), solo lectura: sin drag ni resize, con click en evento hacia la orden real. Se acepta el costo de bundle en la ruta lazy de agenda.
- L5 (user decision): KPIs = los 4 propuestos, con totales exactos del servidor y sin tocar el backend (Solicitudes por atender, Órdenes por programar, Órdenes programadas, Órdenes en proceso).
- L6 (orden de trabajo y concurrencia): T1 (combobox) bloquea T2/T3/T4; T5 (KPIs) es disjunto y corre en paralelo. T3 y T6 tocan el mismo `agenda-page.html`, así que son secuenciales: primero filtros en cabecera, después el calendario. La instalación de FullCalendar es una mutación global (`package.json`/`node_modules`) y no se ejecuta mientras otros writers corren tests.
