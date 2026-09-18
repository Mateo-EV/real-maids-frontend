# Roles y navegación

## Estado actual

Angular Router carga de forma diferida `/login` y `/admin`. P01 funciona con autenticación en memoria; `/admin` es un destino temporal protegido que permite verificar sesión y logout. No existe todavía menú, ACL ni pantalla real por rol.

Todo lo que sigue es **alcance funcional previsto**, no implementación.

## Actores previstos

- administrador;
- personal administrativo;
- personal de campo;
- cliente;
- jefe o perfil autorizado para determinados indicadores.

La relación entre “jefe” y el modelo formal de permisos sigue pendiente. No se debe asumir que equivale a administrador.

## Entrada objetivo por perfil

| Perfil                  | Vista inicial prevista          | Estado          |
| ----------------------- | ------------------------------- | --------------- |
| Administrador           | P02 Dashboard                   | No implementada |
| Personal administrativo | P06 Órdenes de servicio         | No implementada |
| Personal de campo       | P09 Mis servicios asignados     | No implementada |
| Cliente                 | P11 Mis solicitudes y servicios | No implementada |

## Pantallas previstas

| ID  | Pantalla                    | Usuario principal documentado | Estado                                              |
| --- | --------------------------- | ----------------------------- | --------------------------------------------------- |
| P01 | Inicio de sesión            | Todos                         | Parcial frontend: UI, source demo, guards y pruebas |
| P02 | Dashboard                   | Administrador/jefe autorizado | No implementada                                     |
| P03 | Usuarios, roles y permisos  | Administrador                 | No implementada                                     |
| P04 | Clientes/historial          | Personal administrativo       | No implementada                                     |
| P05 | Solicitudes de servicio     | Personal administrativo       | No implementada                                     |
| P06 | Órdenes de servicio         | Personal administrativo       | No implementada                                     |
| P07 | Personal de campo           | Administrador                 | No implementada                                     |
| P08 | Programación y asignaciones | Personal administrativo       | No implementada                                     |
| P09 | Mis servicios asignados     | Personal de campo             | No implementada                                     |
| P10 | Atención al cliente         | Cliente/administrativo        | No implementada                                     |
| P11 | Mis solicitudes y servicios | Cliente                       | No implementada                                     |
| P12 | Reportes                    | Administrador                 | No implementada                                     |
| P13 | Integración QuickBooks      | Administrador                 | No implementada                                     |

Esta tabla no es una ACL. Los permisos definitivos deben provenir del backend y RF02.

## Recorridos objetivo

```text
Clientes -> Solicitud -> Orden -> Programación y asignaciones
Mis servicios asignados -> Detalle -> Actualizar estado
Mis solicitudes y servicios -> Detalle -> Atención al cliente
```

Al implementar, conservar el contexto del registro y los filtros útiles para evitar captura repetida.

## Estados de dominio

Orden normal:

```text
Pendiente -> Programada -> En proceso -> Completada -> Pagado
```

Atención al cliente:

```text
Recibida -> En revisión -> Resuelta -> Cerrada
```

La cancelación de una orden es una salida alternativa. No inventar otras transiciones.

## Reglas de routing

- Rutas por feature y carga diferida cuando sea útil; auth ya sigue este patrón.
- Guard de sesión implementado; permisos por rol pendientes del contrato real.
- Redirección inicial basada en permisos confirmados, no solo en un nombre de rol local.
- Una URL directa no autorizada debe bloquearse en UI y ser rechazada por backend.
- `/login` usa prerender y las rutas protegidas CSR mientras la sesión sea solo en memoria.
