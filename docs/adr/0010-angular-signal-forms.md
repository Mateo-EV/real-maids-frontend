# ADR-010: Angular Signal Forms para formularios de interfaz

- Estado: Accepted
- Fecha: 2026-09-18

## Contexto

P01 fue el primer formulario funcional del proyecto y se implementó inicialmente con Reactive Forms. El proyecto usa Angular 22 y signals para el estado local; además, Spartan soporta de forma directa `FormRoot` y `FormField` de Angular Signal Forms.

Se requiere una base coherente para los próximos formularios sin crear todavía una abstracción compartida que oculte la API de Angular.

## Decisión

Usar Angular Signal Forms (`@angular/forms/signals`) como API base para los formularios de interfaz desarrollados por el proyecto:

- el modelo es un `signal` y permanece como fuente de verdad;
- la estructura y validación se crean con `form()` y validadores de Signal Forms;
- los templates enlazan el formulario y sus controles con `[formRoot]` y `[formField]`;
- los errores se leen desde `errors()` y el estado de interacción desde señales como `touched()`;
- los envíos usan `submit()` y su estado `submitting()`;
- Spartan `field` continúa proporcionando composición visual y accesible.

La decisión no crea un formulario base, wrapper genérico ni esquema compartido. Esas abstracciones solo se incorporarán cuando varios casos reales demuestren una necesidad repetida.

## Consecuencias

- El estado del formulario se integra con el modelo reactivo de Angular sin `FormGroup` ni suscripciones a `valueChanges`.
- Las pruebas consultan el estado mediante señales y esperan el resultado asíncrono de `submit()`.
- Los adaptadores de aplicación y dominio no cambian por esta decisión.
- Las actualizaciones mayores de Angular deben revisar compatibilidad y migraciones de `@angular/forms/signals`.
- P01 sirve como referencia inicial, no como abstracción obligatoria para todos los casos.

## Alternativas consideradas

- Mantener Reactive Forms: funcional, pero no sigue la dirección solicitada para el proyecto.
- Template-driven forms: menor control explícito sobre modelo, validación y envío en flujos complejos.
- Crear una capa propia de formularios: descartada por falta de casos repetidos que justifiquen esa complejidad.
