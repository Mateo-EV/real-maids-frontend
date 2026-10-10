// Fail closed until an explicitly approved HTTPS API origin is configured.
export const environment = {
  label: "Producción",
  production: true,
  apiUrl: null as string | null
} as const
