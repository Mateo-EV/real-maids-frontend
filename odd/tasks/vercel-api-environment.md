# Vercel API environment configuration

## Authorized goal

The user needs a root `.env.example` and a real connection from Vercel's `API_URL` build environment to the Angular browser API origin. The earlier manual production TypeScript example did not satisfy that goal. No deployment, credentials, staging, commits, existing IAM rollback, hosting/render-mode change or native review rounds are authorized.

## Evidence and decisions

- Angular 22 application builder supports `define`; local `npx --no-install ng build --help` confirms the CLI array option and quoted string requirements.
- `environment.production.ts` currently provides a null origin. Development retains localhost. Runtime SSR variables alone do not rewrite browser bundles.
- Use a workspace-local Node build wrapper, safe JSON constant injection and HTTPS-origin validation. Preserve null/fail-closed behavior when missing; reject invalid provided values without printing their contents. Do not generate or overwrite tracked environment files during builds.
- Vercel's Angular preset is documented, but the exact Angular 22 Express/SSR deployment remains unverified. Do not silently switch to static rendering or claim deployment acceptance.
- The current staged binary diff SHA-256 is `e7c061d906f73d08f47b0bbe6125de3913841ce5a02eb0fc2ee78f70840d5cf9`, including the earlier TypeScript example. Preserve index bytes/identity; new changes remain unstaged.
- `.env.example` previously hit a sensitive-file write guard in a child. Use only the normal authorized interactive primary write route; stop and report if it denies. No alternative shell or guard configuration bypass.

## Tasks (delivery remains open until approved commit)

- [ ] V1 — Add the literal public `.env.example` via the normal tool, with `API_URL` and accurate Vercel build-time guidance. Blocked: the normal primary `write` also refused `.env.example` as a sensitive path. No file was created; do not bypass via shell, generated files, aliases or guard configuration. Request an explicit safe continuation (manual user-created example plus authorized build integration, or stop).
- [ ] V2 — Delegate build-time injection, deterministic missing/valid/invalid-input tests and focused documentation; retain SSR/client security boundaries and existing staged content. Not started; waiting for the safe continuation after the file-policy refusal.
- [ ] V3 — Independently verify configured and missing-origin builds, formatter/tests and stage preservation; report SSR deployment/CORS acceptance caveats.

## Routing and checks

V1 is a mechanical one-file primary write. V2 is one bounded writer because scripts/package/config/tests/docs span multiple meaningful files. V3 follows native read-only ASSESS's risk plan; no native review rounds or committed-only review of unstaged work.

Observe meaningful configuration RED, GREEN and alternate cases. Use the local Angular production build with a reserved public example origin, then verify that browser/server outputs receive that origin without making authenticated API calls. Also verify the missing-input null behavior and unchanged development default. No whole-IAM test count is inherited as proof of new configuration.

Forecast: approximately 200–350 authored lines including focused tests/docs; generated build outputs excluded. Delivery strategy: ask-on-risk. No stage or commit permission exists.
