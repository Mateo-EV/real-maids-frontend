# ADR-003: Navegación y rutas conscientes del rol

- Estado: Accepted
- Fuente: Avance 1, secciones 3.3, 4.3 y RNF01

## Contexto

La solución tiene administradores, personal administrativo, personal de campo y clientes con vistas diferenciadas.

## Decisión

La UI y las rutas privadas deben adaptarse a permisos/roles. Se usarán mecanismos de protección de rutas para evitar acceso accidental a pantallas no autorizadas.

## Consecuencias

- El menú se genera según permisos disponibles.
- Las URLs privadas deben protegerse.
- La autorización definitiva sigue siendo responsabilidad del backend.
- No se debe inferir una matriz completa de permisos únicamente a partir de la pantalla principal de cada rol.
