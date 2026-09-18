# ADR-005: QuickBooks Online se integra solo desde el backend

- Estado: Accepted
- Fuente: Avance 1, RF16/RF17 y RNF13/RNF14

## Contexto

La solución sincronizará clientes, facturas y estados de pago con QuickBooks Online mediante la API oficial y OAuth 2.0.

## Decisión

Angular no se comunicará directamente con QuickBooks Online. Toda interacción se realizará a través del backend Spring Boot.

## Consecuencias

- No incluir client secrets, refresh tokens o secretos de Intuit en el frontend.
- P13 consume únicamente endpoints internos del backend.
- La UI puede mostrar estados/errores/reintentos, pero la idempotencia y conciliación son responsabilidad backend.
