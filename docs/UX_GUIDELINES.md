# Guía UX/UI

## Stack vigente

La UI debe construirse con Spartan UI y Tailwind CSS 4:

- Brain aporta comportamiento/accesibilidad.
- Helm vive como código local en `libs/ui`.
- Los colores del producto se expresan mediante tokens semánticos definidos en `src/styles.css`.
- Angular Material y Bootstrap no forman parte del stack vigente.

P01 es la primera pantalla implementada y aplica estas reglas: jerarquía clara, composición Spartan, responsive, validación junto al campo, estado de carga, error recuperable y acción principal única.

## Flujo Spartan

1. Ejecutar `npx ng generate @spartan-ng/cli:info --json`.
2. Revisar componentes instalados y disponibles.
3. Reutilizar Helm existente antes de crear markup propio.
4. Generar componentes faltantes con `@spartan-ng/cli:ui`.
5. Usar variantes/tamaños incorporados y tokens semánticos.
6. Registrar iconos con `provideIcons` cuando se usen.
7. Verificar foco, teclado, estados y responsive.

Componentes actuales: button, checkbox, field, input, label, separator y utils.

## Estructura responsive objetivo

### Escritorio

- cabecera con identidad/sesión;
- navegación lateral autorizada;
- área principal con título, filtros, contenido y acciones.

### Móvil

- navegación compacta;
- contenido prioritario en una columna;
- acciones esenciales visibles;
- tarjetas o vistas adaptadas en lugar de tablas extensas.

## Principios

- Mantener jerarquía clara de título, contexto, contenido y acciones.
- Distinguir “Solicitud de servicio” de “Atención al cliente”.
- Usar verbos concretos en acciones.
- No usar color como único indicador de estado.
- Mostrar etiqueta textual junto con icono/color cuando comunique estado.
- Diferenciar loading, empty, error y success.
- Preservar contexto y filtros útiles al navegar.

## Formularios

- Componer campos con los componentes Spartan `field`, `label`, `input`, `checkbox`, etc.
- Usar Angular Signal Forms con `formRoot`/`formField`, validadores declarativos y errores derivados de `errors()`.
- Marcar requeridos y asociar error/ayuda al control accesible.
- Confirmar éxito solo después de respuesta backend correcta.
- Deshabilitar y mostrar progreso durante envíos sin crear acciones duplicadas.
- Confirmar operaciones de impacto con el registro afectado.
- No advertir duplicados sin criterio backend validado.

## Idioma, fechas y horarios

La interfaz debe prepararse para español e inglés, pero la librería y fallback i18n siguen abiertos. La programación debe mostrar la zona horaria operativa cuando el contrato la defina. No codificar formatos o zonas por intuición.

## Validación requerida

Cuando existan las pantallas, validar al menos:

1. registrar solicitud para un cliente existente;
2. programar una orden;
3. consultar servicio asignado desde móvil;
4. enviar atención al cliente;
5. navegación por teclado y foco;
6. loading, vacío, error y éxito.
