// Public build-time template; Angular does not load .env files automatically.
// Later, manually copy this file to environment.production.ts before npm run build.
// Replace apiUrl's null with an approved HTTPS origin, e.g. "https://api.example.com".
// Use only the origin: no /api or other path, query, fragment, or userinfo.
// Null intentionally fails closed; the example host is not an automatic fallback.
// All bundled values are public: never include passwords, tokens, or backend secrets.
// Changing SSR runtime environment variables after build does not change the browser API URL.
// Optional SSR: set the actual PORT environment variable; src/server.ts defaults to 4000.
// No dotenv autoloading or hosting provider is assumed.
export const environment = {
  label: "Producción",
  production: true,
  apiUrl: null as string | null
} as const
