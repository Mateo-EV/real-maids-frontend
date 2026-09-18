# ADR-002: El frontend consume únicamente la API interna REST/JSON

- Estado: Accepted
- Fuente: Avance 1, arquitectura general y sección 3.3

## Contexto

La lógica de negocio, validaciones, autenticación y acceso a datos pertenecen al backend Spring Boot.

## Decisión

Angular se comunicará con el backend mediante servicios HTTP/HTTPS REST y JSON. Los componentes no deben integrar directamente sistemas externos de negocio.

## Consecuencias

- Centralizar llamadas HTTP en servicios/adaptadores.
- No duplicar reglas de negocio como autoridad final en cliente.
- Validar contratos contra OpenAPI.
- HTTPS en producción.
