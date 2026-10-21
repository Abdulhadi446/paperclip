import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const MAX_PAGES = 40
const MAX_TEXT_CHARS = 200_000
const MAX_IMAGE_PAGES = 3
const PDFTOPPM_TIMEOUT_MS = 20_000

export type ExtractedPage = {
  index: number
  text: string
  image?: string
}

export type ExtractResult = {
  pageCount: number
  text: string
  pages: ExtractedPage[]
}

export class PdfExtractError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "PdfExtractError"
  }
}

type PdfJsTextItem = { str: string; hasEOL?: boolean }

function joinTextItems(items: unknown[]): string {
  let out = ""

  for (const raw of items) {
    const item = raw as PdfJsTextItem
    if (typeof item?.str !== "string") continue

    const str = item.str
    if (!str) {
      if (item.hasEOL) out += "\n"
      continue
    }

    if (out && !/[\s]$/.test(out) && !/^[\s]/.test(str)) {
      out += " "
    }
    out += str
    if (item.hasEOL) out += "\n"
  }

  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

async function renderPagePng(pdfPath: string, pageNumber: number, dir: string): Promise<string | undefined> {
  const prefix = path.join(dir, `page-${pageNumber}`)
  try {
    await execFileAsync(
      "pdftoppm",
      [
        "-png",
        "-r",
        "90",
        "-scale-to",
        "1400",
        "-singlefile",
        "-f",
        String(pageNumber),
        "-l",
        String(pageNumber),
        pdfPath,
        prefix,
      ],
      { timeout: PDFTOPPM_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
    )

    const png = await fs.readFile(`${prefix}.png`)
    return `data:image/png;base64,${png.toString("base64")}`
  } catch {
    // Rendering is a nice-to-have; text extraction still succeeds without it.
    return undefined
  }
}

export async function extractPdf(data: Buffer): Promise<ExtractResult> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-extract-"))
  const pdfPath = path.join(dir, "input.pdf")

  try {
    await fs.writeFile(pdfPath, data)

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
    // Turbopack rewrites pdfjs's relative worker lookup, so point the fake
    // worker at the real file in node_modules.
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ).href

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(data),
      useSystemFonts: true,
    })

    let doc: Awaited<typeof loadingTask.promise>
    try {
      doc = await loadingTask.promise
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new PdfExtractError(
        /password/i.test(message) ? "PDF is password protected" : `Could not read PDF: ${message}`,
        err,
      )
    }

    try {
      const pageCount = doc.numPages
      const pages: ExtractedPage[] = []
      const chunks: string[] = []
      let totalChars = 0

      for (let pageNumber = 1; pageNumber <= Math.min(pageCount, MAX_PAGES); pageNumber++) {
        if (totalChars >= MAX_TEXT_CHARS) break

        const page = await doc.getPage(pageNumber)
        const content = await page.getTextContent()
        let text = joinTextItems(content.items as unknown[])

        const remaining = MAX_TEXT_CHARS - totalChars
        if (text.length > remaining) {
          text = text.slice(0, remaining)
        }
        totalChars += text.length
        chunks.push(text)

        const entry: ExtractedPage = { index: pageNumber, text }

        if (pageNumber <= MAX_IMAGE_PAGES) {
          const image = await renderPagePng(pdfPath, pageNumber, dir)
          if (image) entry.image = image
        }

        pages.push(entry)
        page.cleanup()
      }

      return { pageCount, text: chunks.join("\n\n"), pages }
    } finally {
      await loadingTask.destroy().catch(() => undefined)
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
