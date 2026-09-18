# ADR-007: Angular SSR, hidratación y prerender

- Estado: Accepted
- Fecha: 2026-09-18
- Tipo: formalización de implementación existente

## Contexto

El workspace fue creado con soporte SSR. `angular.json` compila browser y server, `src/server.ts` usa Express con `AngularNodeAppEngine`, y el cliente registra hidratación. El login público es estable, pero las rutas protegidas dependen de una sesión actualmente efímera.

## Decisión

Mantener SSR Angular y la hidratación como parte de la plataforma. Prerenderizar `/login` y usar `RenderMode.Client` para el resto mientras no exista una sesión backend recuperable durante SSR.

Cuando se defina autenticación real, revisar explícitamente el render mode por ruta.

## Consecuencias

- El código debe ser seguro para ejecución en servidor.
- El acceso a `window`, `document`, storage u otras APIs del navegador requiere abstracción/comprobación de plataforma.
- El build produce bundles browser/server y salida prerenderizada.
- El despliegue deberá soportar la salida elegida; no se asume Vercel.

## Alternativas consideradas

- SPA solo cliente: no describe la implementación actual.
- SSG total permanente: no se acepta para futuras rutas privadas sin revisar requisitos.
