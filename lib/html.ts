/**
 * Helpers for pulling a document out of an assistant response.
 *
 * The assistant is instructed to answer with short prose plus exactly one
 * fenced ```html block. During streaming that block may be incomplete, so the
 * extractor has to work on partial text.
 */

const FENCE = /```(?:html|HTML)\s*\n?([\s\S]*?)(?:```|$)/g

export type Extracted = {
  /** Full HTML document if one was found (may be partial while streaming). */
  html: string | null
  /** True when the closing fence arrived. */
  complete: boolean
  /** Assistant prose with the html block removed. */
  prose: string
}

export function extractDocument(text: string): Extracted {
  let html: string | null = null
  let complete = false

  // Prefer the last fenced block: models sometimes show a snippet first.
  for (const match of text.matchAll(FENCE)) {
    const body = match[1] ?? ""
    if (!body.trim()) continue
    html = body
    complete = match[0].trimEnd().endsWith("```")
  }

  const prose = text
    .replace(FENCE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return { html, complete, prose }
}

/** True once the streamed text looks like it has started a document. */
export function hasDocumentStart(text: string): boolean {
  return /```html/i.test(text)
}

const BLOCKED = [
  /<script\b[\s\S]*?<\/script\s*>/gi,
  /<iframe\b[\s\S]*?<\/iframe\s*>/gi,
  /<object\b[\s\S]*?<\/object\s*>/gi,
  /<embed\b[^>]*>/gi,
  /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
  /javascript:/gi
]

/** Strip anything active before rendering model output in an iframe. */
export function sanitizeDocument(html: string): string {
  let out = html
  for (const rule of BLOCKED) out = out.replace(rule, "")
  return out
}

/** Safe filename stem for the exported PDF. */
export function slugifyTitle(title: string, fallback = "document"): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return slug || fallback
}

/** Rough page count estimate for the toolbar before the PDF is rendered. */
export function estimatePageCount(html: string): number {
  const explicit = html.match(/class="[^"]*\bpage\b[^"]*"/gi)
  if (explicit?.length) return explicit.length
  const textLength = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length
  return Math.max(1, Math.ceil(textLength / 2600))
}

/** Best-effort document title from the <title> tag. */
export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)
  return match ? match[1].trim() : null
}
