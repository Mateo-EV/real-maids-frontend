# Trazabilidad frontend

Última reconciliación con el código: **2026-09-27**.

## Criterio de estado

- **No iniciada**: no hay código funcional asociado.
- **Esqueleto**: existen contratos o adaptadores aislados, sin ruta/pantalla/flujo utilizable.
- **Parcial**: existe una porción conectada del flujo.
- **Implementada**: el flujo tiene UI, integración y pruebas acordes a su alcance.

## Cobertura funcional actual

| RF/HU                 | Módulo                      | Pantalla             | Estado         | Evidencia/brecha                                                                               |
| --------------------- | --------------------------- | -------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| RF01 / HU01           | M01 Autenticación           | P01 Inicio de sesión | Parcial (demo) | LoginForm standalone, Signal Forms, AuthStore, source en memoria, guards y pruebas; falta backend/JWT |
| RF02 / HU02           | M02 Usuarios/roles/permisos | P03                  | No iniciada    | Sin feature ni rutas                                                                           |
| RF03 / HU03           | M03 Clientes                | P04                  | Esqueleto      | `customers` con casos de uso de lista/búsqueda, fuente demo y pruebas; sin ruta, pantalla ni contrato API |
| RF04 / HU04           | M04 Solicitudes             | P05                  | No iniciada    | Sin feature ni rutas                                                                           |
| RF05-RF06 / HU05-HU06 | M05 Órdenes                 | P06/P09              | No iniciada    | Sin feature ni máquina/reglas de estado                                                        |
| RF07 / HU07           | M06 Personal de campo       | P07                  | No iniciada    | Sin feature ni rutas                                                                           |
| RF08 / HU08           | M07 Asignaciones            | P08                  | No iniciada    | Sin feature ni rutas                                                                           |
| RF09 / HU09           | M08 Programación            | P08                  | No iniciada    | Sin feature ni contrato de fechas/zona horaria                                                 |
| RF10 / HU10           | M05 Servicios asignados     | P09                  | No iniciada    | Sin feature ni rutas                                                                           |
| RF11 / HU11           | M09 Atención al cliente     | P10                  | No iniciada    | Sin feature ni rutas                                                                           |
| RF12 / HU12           | M03 Historial               | P04                  | No iniciada    | Sin feature ni rutas                                                                           |
| RF13 / HU13           | M10 Reportes                | P12                  | No iniciada    | Sin feature ni rutas                                                                           |
| RF14 / HU14           | M11 Dashboard               | P02                  | No iniciada    | Sin feature ni rutas                                                                           |
| RF15 / HU15           | M04/M05 Portal cliente      | P11                  | No iniciada    | Sin feature ni rutas                                                                           |
| RF16-RF17 / HU16-HU17 | M12 QuickBooks              | P13                  | No iniciada    | No hay llamadas; debe operar solo vía backend                                                  |

## Capacidades técnicas transversales

| RNF/capacidad                      | Estado actual                                                  |
| ---------------------------------- | -------------------------------------------------------------- |
| RNF01 autenticación/acceso por rol | Login y guards básicos; permisos por rol pendientes            |
| RNF03 HTTPS en producción          | Responsabilidad de despliegue; no verificable aún              |
| RNF04 objetivo de rendimiento      | Sin flujo funcional ni medición                                |
| RNF06 navegación clara             | Login, redirecciones y destino protegido inicial               |
| RNF07 navegadores                  | Objetivo sin matriz de pruebas                                 |
| RNF08 responsive                   | Login implementado responsive; falta validación multinavegador |
| RNF09 extensibilidad               | Features auth y customers con casos de uso; NgRx SignalStore en auth |
| RNF10 separación de capas          | Errores de auth y customers en dominio; adaptadores en infraestructura |
| RNF12 validación/mensajes          | Signal Forms en P01 para validación y error de acceso          |
| RNF13-RNF14 QuickBooks vía backend | Límite documentado; integración no iniciada                    |

## Reglas de mantenimiento

- Actualiza esta matriz en el mismo cambio que conecte una ruta, pantalla o adaptador.
- No cambies a “parcial” por crear carpetas o tipos sin consumidores.
- Para “implementada” exige pruebas relevantes y estados loading/empty/error cuando haya datos remotos.
- Si una feature nueva no posee RF/HU/M/P, añade primero su trazabilidad o registra la excepción.
- La base de dominio de M03 no se considera implementación funcional hasta contar con consumidor,
  ruta o adaptador según corresponda.

## Ambigüedades funcionales vigentes

- La landing pública no tiene RF/HU equivalente claro.
- No existe ACL definitiva por pantalla.
- El alta directa de solicitudes por clientes continúa sin resolver.
- Las transiciones excepcionales de órdenes no están validadas.
- Los contratos QuickBooks de P13 dependen del backend real.
