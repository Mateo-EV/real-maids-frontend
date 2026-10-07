export type PageToken = number | "ellipsis-start" | "ellipsis-end"

/** One-based pages: radius one, shifted at the ends; at most seven tokens.
 * Invalid counts or current pages produce no navigation tokens.
 */
export function pageTokens(currentPage: number, pageCount: number): PageToken[] {
  if (
    !Number.isSafeInteger(pageCount) ||
    !Number.isSafeInteger(currentPage) ||
    pageCount < 1 ||
    currentPage < 1 ||
    currentPage > pageCount
  ) return []

  if (pageCount <= 7)
    return Array.from({ length: pageCount }, (_, index) => index + 1)

  const start = Math.max(1, Math.min(currentPage - 1, pageCount - 2))
  const pages = [...new Set([1, start, start + 1, start + 2, pageCount])]
  const tokens: PageToken[] = []
  for (const page of pages) {
    const previous = tokens.at(-1)
    if (typeof previous === "number") {
      const gap = page - previous
      if (gap === 2) tokens.push(previous + 1)
      else if (gap > 2) tokens.push(previous === 1 ? "ellipsis-start" : "ellipsis-end")
    }
    tokens.push(page)
  }
  return tokens
}
