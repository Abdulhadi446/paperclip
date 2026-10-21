import { PdfExtractError, extractPdf } from "@/lib/pdf/extract"

// Shared upload extraction for every attachment type the app accepts.
// Server-only: imports pdfjs through lib/pdf/extract and mammoth at runtime.

export const MAX_FILE_BYTES = 15 * 1024 * 1024
export const MAX_TEXT_CHARS = 200_000
export const MAX_PDF_PAGES = 40

export type FileKind = "pdf" | "docx" | "txt" | "md" | "csv" | "html"

export type ExtractedPage = {
  index: number
  text: string
  image?: string
}

export type ExtractResult = {
  kind: FileKind
  name: string
  pageCount: number
  text: string
  pages: ExtractedPage[]
}

/** Error carrying the HTTP status the route should respond with. */
export class FileExtractError extends Error {
  readonly status: number

  constructor(message: string, status = 422, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "FileExtractError"
    this.status = status
  }
}

const EXTENSION_KINDS: Record<string, FileKind> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".txt": "txt",
  ".md": "md",
  ".csv": "csv",
  ".html": "html",
  ".htm": "html",
}

const MIME_KINDS: Record<string, FileKind> = {
  "application/pdf": "pdf",
  "application/x-pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/comma-separated-values": "csv",
  "text/html": "html",
  "application/xhtml+xml": "html",
}

export const SUPPORTED_KINDS: FileKind[] = ["pdf", "docx", "txt", "md", "csv", "html"]

/** Characters used when estimating a "page" for formats with no real pagination. */
const CHARS_PER_PAGE = 3000

function extensionOf(name: string): string {
  const clean = (name || "").trim().toLowerCase()
  const dot = clean.lastIndexOf(".")
  return dot === -1 ? "" : clean.slice(dot)
}

/** Detect the upload kind from the filename first, then the MIME type. */
export function detectKind(name: string, type: string): FileKind | null {
  const byExtension = EXTENSION_KINDS[extensionOf(name)]
  if (byExtension) return byExtension

  const mime = (type || "").split(";")[0].trim().toLowerCase()
  if (MIME_KINDS[mime]) return MIME_KINDS[mime]

  // Generic MIME types are not enough to pick a format, but the extension
  // already had its chance above, so this is genuinely unsupported.
  return null
}

/** A PDF with possible junk before the header in the first 1KB. */
export function isPdfUpload(name: string, type: string, data: Buffer): boolean {
  const mimeOk = type === "application/pdf" || type === "application/x-pdf"
  // Some clients send application/octet-stream, so also accept the extension.
  const extOk = name.toLowerCase().endsWith(".pdf")
  if (!mimeOk && !extOk) return false

  return data.subarray(0, 1024).includes(Buffer.from("%PDF-"))
}

function normalizeText(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim()
}

function clampText(text: string): string {
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text
}

/**
 * Split plain text into pseudo-pages so the response keeps the same
 * `pages[]` shape as PDFs. Covers every character of `text`.
 */
function paginateText(text: string): { pageCount: number; pages: ExtractedPage[] } {
  if (!text) return { pageCount: 1, pages: [{ index: 1, text: "" }] }

  const pageCount = Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE))
  const chunkSize = Math.ceil(text.length / pageCount)
  const pages: ExtractedPage[] = []

  for (let i = 0; i < pageCount; i++) {
    pages.push({ index: i + 1, text: text.slice(i * chunkSize, (i + 1) * chunkSize) })
  }

  return { pageCount, pages }
}

function decodeText(data: Buffer): string {
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(data.subarray(2))
  }
  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(data.subarray(2))
  }
  return new TextDecoder("utf-8").decode(data)
}

function decodeReadableText(data: Buffer, kind: FileKind): string {
  // NUL bytes in the head mean this is a binary file with a text extension.
  if (data.subarray(0, 4096).includes(0)) {
    throw new FileExtractError(`File does not look like a readable ${kind.toUpperCase()} document`, 422)
  }

  let text: string
  try {
    text = decodeText(data)
  } catch (err) {
    throw new FileExtractError(`Could not decode file as UTF-8 text`, 422, err)
  }

  return clampText(normalizeText(text))
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  middot: "\u00b7",
  bull: "\u2022",
  deg: "\u00b0",
  euro: "\u20ac",
  pound: "\u00a3",
  laquo: "\u00ab",
  raquo: "\u00bb",
  times: "\u00d7",
  divide: "\u00f7",
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1]?.toLowerCase() === "x"
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

/** Strip markup into readable text, keeping block-level line breaks. */
function htmlToText(html: string): string {
  let text = html

  text = text.replace(/<!--[\s\S]*?-->/g, " ")
  // Drop non-content elements entirely (head also removes title/meta).
  text = text.replace(
    /<(script|style|noscript|template|svg|canvas|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    " ",
  )
  text = text.replace(/<br\s*\/?>/gi, "\n")
  text = text.replace(
    /<\/(p|div|section|article|header|footer|main|aside|nav|li|tr|h[1-6]|blockquote|pre|table|ul|ol|dl|dt|dd|figure|figcaption|form|fieldset)\s*>/gi,
    "\n",
  )
  text = text.replace(/<(li|tr|br)\b[^>]*>/gi, "\n")
  text = text.replace(/<\/t[dh]\s*>/gi, "\t")
  text = text.replace(/<[^>]*>/g, "")

  text = decodeEntities(text)
  text = text.replace(/\r\n?/g, "\n")
  text = text.replace(/[ \t\f\v\u00a0]+/g, " ")
  text = text.replace(/ *\n */g, "\n")
  text = text.replace(/\n{3,}/g, "\n\n")

  return text.trim()
}

async function extractPdfResult(data: Buffer, name: string): Promise<ExtractResult> {
  try {
    const result = await extractPdf(data)
    // Existing PDF behavior caps pages itself (MAX_PDF_PAGES) while
    // reporting the real pageCount; keep that exactly as-is.
    return { kind: "pdf", name, ...result }
  } catch (err) {
    if (err instanceof PdfExtractError) {
      throw new FileExtractError(err.message, 422, err)
    }
    throw err
  }
}

async function extractDocxResult(data: Buffer, name: string): Promise<ExtractResult> {
  // DOCX is a zip container; a missing PK header can't be parsed by mammoth.
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) {
    throw new FileExtractError("File is not a valid .docx document", 422)
  }

  let raw: string
  try {
    const mammoth = (await import("mammoth")).default
    const result = await mammoth.extractRawText({ buffer: data })
    raw = result.value
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new FileExtractError(`Could not read DOCX: ${message}`, 422, err)
  }

  const text = clampText(normalizeText(raw).replace(/[ \t]+\n/g, "\n"))
  const { pageCount, pages } = paginateText(text)

  return { kind: "docx", name, pageCount, text, pages }
}

function extractTextResult(data: Buffer, name: string, kind: FileKind): ExtractResult {
  let text = decodeReadableText(data, kind)
  if (kind === "html") text = clampText(htmlToText(text))

  const { pageCount, pages } = paginateText(text)

  return { kind, name, pageCount, text, pages }
}

/**
 * Extract text (and, for PDFs, optional page previews) from an upload.
 * Throws {@link FileExtractError} with the HTTP status for the caller.
 */
export async function extractFile(
  data: Buffer,
  options: { name?: string; type?: string; kind?: FileKind } = {},
): Promise<ExtractResult> {
  const name = options.name?.trim() || "upload"

  if (data.length === 0) {
    throw new FileExtractError("Uploaded file is empty", 400)
  }

  if (data.length > MAX_FILE_BYTES) {
    throw new FileExtractError("File exceeds the 15MB limit", 413)
  }

  const kind = options.kind ?? detectKind(name, options.type ?? "")
  if (!kind) {
    throw new FileExtractError(
      "Unsupported file type. Upload a PDF, DOCX, TXT, MD, CSV, or HTML file.",
      415,
    )
  }

  if (kind === "pdf") {
    if (!isPdfUpload(name, options.type ?? "", data)) {
      throw new FileExtractError("File does not look like a PDF", 415)
    }
    return extractPdfResult(data, name)
  }

  if (kind === "docx") {
    return extractDocxResult(data, name)
  }

  return extractTextResult(data, name, kind)
}
