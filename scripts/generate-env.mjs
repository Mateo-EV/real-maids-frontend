import { writeFileSync } from "node:fs"

const apiUrl = process.env.API_URL

if (!apiUrl) {
  throw new Error("Falta la variable API_URL")
}

const environment = {
  production: true,
  apiUrl
}

writeFileSync(
  "src/environments/environment.production.ts",
  `export const environment = ${JSON.stringify(environment, null, 2)};\n`
)
