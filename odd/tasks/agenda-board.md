# Agenda board: vista propia con Spartan + tokens del tema

Feature: reemplazar el render de FullCalendar de la agenda de Operaciones por una grilla propia
construida con componentes Helm (Spartan) y los tokens semánticos del proyecto.

## Specs

- **S1.** Pedido del usuario, textual: "mm he estado viendo el diseño de la agenda y no me gusta
  como queda con la liberia, me opdrias hacer una mejor vista usando componentes de spartan ng y
  el tema del proyecto".
- **S2.** Estructura elegida por el usuario: **grilla horaria** para día y semana (columnas por día,
  eje de horas, turnos posicionados por horario) y **mes como tabla** de días con lista compacta de
  turnos por día.
- **S3.** Dependencia elegida por el usuario: **quitar `@fullcalendar` del todo** — `package.json`,
  el CSS de `angular.json`, el componente actual y su spec.
- **S4.** Contrato de comportamiento que sobrevive: fechas y horas se muestran literales (sin
  conversión de zona), los turnos devueltos fuera de la ventana consultada nunca se dibujan (la
  página los informa), el clic emite el ID real de la orden, el `aria-label` lleva la proyección
  completa devuelta por el backend, una fecha en blanco no renderiza nada, el servidor no renderiza
  nada, y no existen controles prev/next/hoy.
- **S5.** Tema: sólo tokens semánticos (`--card`, `--border`, `--foreground`, `--muted`,
  `--muted-foreground`, `--primary`, `--ring`, `--radius`, `--kpi-*`), ninguna fuente de color
  literal, componentes Helm (`hlmBadge`, `hlmBtn`) donde aportan, y lectura usable a 390 px.
- **S6.** Documentación: README de Operaciones y `AGENTS.md` describen la vista nueva; ninguna
  afirmación de aceptación live/browser.
- **S7.** Evidencia: specs enfocados (layout, board, página, rutas), suite de Operaciones, build de
  producción con SSR y Prettier.

## Tasks

- T1 — `agenda-layout.ts`: relojes literales, eje de horas, carriles de solapamiento, celdas de mes, etiquetas accesibles. (S4)
- T2 — `AgendaBoard`: grilla día/semana con semana lunes→domingo y tabla de mes, con tokens del tema. (S2, S5)
- T3 — Reemplazar el consumidor en la página y sus specs de grilla. (S4)
- T4 — Eliminar `@fullcalendar` de `package.json`, `angular.json` y borrar el componente viejo. (S3)
- T5 — Documentación (README de Operaciones, `AGENTS.md`). (S6)

## Log

- L1 (usuario, textual): "mm he estado viendo el diseño de la agenda y no me gusta como queda con la
  liberia, me opdrias hacer una mejor vista usando componentes de spartan ng y el tema del proyecto

  recuerda utilizar codegraph para tus busquedas"

- L2 (usuario, decisiones): estructura = grilla horaria (día/semana) + mes como tabla; dependencia =
  quitarla del todo (package.json + angular.json).

- L3 (evidencia observable, 2026-11-18): `tsc` app y spec sin errores; Prettier limpio en todos los
  archivos tocados; specs enfocados del cambio 73/73 en 4 archivos; suite de Operaciones 1249/1249 en
  41 archivos; `ng build` de producción exit 0 con un prerender. El CSS del tablero no tiene ningún
  color literal: sólo tokens (`--card`, `--border`, `--muted`, `--primary`, `--ring`, `--radius`,
  `--destructive`, `--gold`, `--kpi-*`).
- L4 (deuda abierta, decidida): el CSS del tablero pesa 6.55 kB compilado y supera el warning de
  4 kB de `anyComponentStyle` (`angular.json`); el techo de error del mismo budget es 8 kB.
  Compactar los tonos y las reglas repetidas lo bajó de 7.43 kB a 6.55 kB con 36/36 specs del tablero
  y la página todavía en verde, pero no alcanza para el 4 kB. Decisión del humano (textual): "Dejarlo
  advertido y documentado". No se cambió ninguna configuración: el warning queda registrado en este
  documento, en `AGENTS.md` y en el README de Operaciones como deuda con ~1.4 kB de margen antes del
  error, y cualquier crecimiento del CSS del tablero tiene que resolverse antes de llegar a 8 kB.
- L5 (limpieza de dependencia): `package.json`, `package-lock.json` y los `styles` de `angular.json`
  quedan sin `@fullcalendar`; sobrevive material obsoleto en `node_modules` y en `.angular/cache`
  que ningún import referencia y que se descarta en la próxima instalación limpia.
