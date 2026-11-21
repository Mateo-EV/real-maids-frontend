/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { expect } from "vitest"

/**
 * Shared assertion for the portal's component metadata shape.
 *
 * The dev server re-applies a component's metadata when its template changes while the page is open:
 * `ɵɵreplaceMetadata` calls the rebuilt metadata function with a `ɵɵnamespaces` array and every
 * dependency is re-resolved by index. A dependency declared as a spread of an imported `*Imports`
 * constant is re-read as `ɵɵnamespaces[i].HlmTextarea` / `.HlmSpinner` / `.HlmCaption`, so any skew
 * between that array and the chunk the browser already loaded throws
 * `Cannot read properties of undefined (reading 'HlmSpinner')` and the page's metadata fails.
 *
 * That is a real, measured browser defect across the customer portal: it flooded the console of
 * `/portal/requests`, `/portal/requests/:id`, `/portal/services`, `/portal/services/:id`,
 * `/portal/support`, `/portal/support/:id` and `/portal/support/new`. A fixture-based render test
 * cannot see it, because a spec always builds the metadata and the component definition from the
 * same revision.
 *
 * Direct identifier imports are handed to the rebuilt metadata as plain arguments instead, so the
 * page keeps rendering however the two revisions disagree. This helper pins that shape where the
 * compiler reads it, in the component source, and refuses a spread or a bare `*Imports` constant.
 */

/** Every portal experience source that declares an Angular component's `imports` array. */
const portalRoot = "src/app/experiences/portal"
const importsMarker = "imports: ["

function workspacePath(path: string): string {
  return resolve(process.cwd(), path)
}

function sourceFiles(directory: string): string[] {
  const absolute = workspacePath(directory)
  return readdirSync(absolute, { withFileTypes: true })
    .flatMap(entry => {
      const child = join(directory, entry.name)
      if (entry.isDirectory()) {
        return sourceFiles(child)
      }
      // Specs and shared `.testing.ts` fixtures never declare the components under guard.
      if (!entry.isFile() || !entry.name.endsWith(".ts")) {
        return []
      }
      return entry.name.endsWith(".spec.ts") || entry.name.endsWith(".testing.ts") ? [] : [child]
    })
    .sort()
}

export function portalComponentSources(): string[] {
  return sourceFiles(portalRoot).filter(path => {
    const source = readFileSync(workspacePath(path), "utf8")
    return source.includes("@Component") && source.includes(importsMarker)
  })
}

/**
 * The entries declared in a component's `imports: [...]`, one per dependency, with the array
 * balanced by hand because the declaration itself may span several lines.
 */
export function declaredImportEntries(sourcePath: string): string[] {
  const source = readFileSync(workspacePath(sourcePath), "utf8")
  const start = source.indexOf(importsMarker)
  expect(start, `${sourcePath} declares an \`imports: [\` array`).toBeGreaterThan(-1)
  const bodyStart = start + importsMarker.length
  let depth = 1
  let end = -1
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === "[") {
      depth += 1
    } else if (char === "]") {
      depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
  }
  expect(end, `${sourcePath} closes its \`imports: [\` array`).toBeGreaterThan(bodyStart)
  return source
    .slice(bodyStart, end)
    .replace(/\/\/[^\n]*/g, "")
    .split(",")
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
}

/**
 * Asserts one component declares its dependencies as the directive/component values themselves,
 * by name, and therefore survives a dev-server metadata re-application at any revision skew.
 */
export function expectNamedImportEntries(sourcePath: string): void {
  const entries = declaredImportEntries(sourcePath)
  // Guards against a broken read of the declaration, not against a small component.
  expect(entries.length, `${sourcePath} declares its dependencies`).toBeGreaterThan(0)
  // A namespace read is what the dev server resolves by index; only plain identifiers are safe.
  expect(
    entries.filter(entry => !/^[A-Za-z_$][\w$]*$/.test(entry)),
    `${sourcePath} declares every dependency by name`
  ).toEqual([])
  expect(
    entries.filter(entry => entry.startsWith("...")),
    `${sourcePath} never spreads an imported array`
  ).toEqual([])
  expect(
    entries.filter(entry => entry.endsWith("Imports")),
    `${sourcePath} never reuses an *Imports constant`
  ).toEqual([])
}
