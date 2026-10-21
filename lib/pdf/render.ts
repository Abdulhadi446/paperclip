import puppeteer, { type Browser, type Page } from "puppeteer-core"

/**
 * Server-only HTML -> PDF rendering via a system Chromium.
 *
 * A single browser instance is shared by all requests in the Node process and
 * relaunched automatically after a crash/disconnect.
 */

export type PdfRenderErrorCode = "LAUNCH_FAILED" | "TIMEOUT" | "RENDER_FAILED"

export class PdfRenderError extends Error {
  readonly code: PdfRenderErrorCode

  constructor(message: string, code: PdfRenderErrorCode, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = "PdfRenderError"
    this.code = code
  }
}

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/usr/bin/chromium"
const CHROMIUM_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"]
const RENDER_TIMEOUT_MS = 25_000
const FONT_WAIT_MS = 3_000

const PRINT_CSS = `
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#fff}
*,*::before,*::after{box-sizing:border-box}
img{max-width:100%!important;height:auto!important}
svg{max-width:100%}
table{max-width:100%;border-collapse:collapse}
pre{white-space:pre-wrap;word-break:break-word}
`

/**
 * Documents own their page margins through `@page`. Only when a document forgot
 * to declare one do we supply a sane A4 fallback — injecting it unconditionally
 * would override the author's margins and break pagination.
 */
const FALLBACK_PAGE_CSS = `@page{size:A4;margin:15mm 16mm 18mm}`

let browserPromise: Promise<Browser> | null = null

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const browser = await browserPromise
      if (browser.connected) return browser
    } catch {
      // Previous launch failed; fall through and retry.
    }
    browserPromise = null
  }

  const launching = puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: CHROMIUM_ARGS,
  })
  browserPromise = launching

  try {
    const browser = await launching
    browser.on("disconnected", () => {
      if (browserPromise === launching) browserPromise = null
    })
    return browser
  } catch (err) {
    if (browserPromise === launching) browserPromise = null
    throw new PdfRenderError(
      `Failed to launch Chromium at ${CHROMIUM_PATH}: ${errorMessage(err)}`,
      "LAUNCH_FAILED",
      err,
    )
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Merge the caller's document with our print stylesheet. Callers may pass a
 * fragment or a full document; both end up as a complete HTML document.
 */
function buildDocument(input: string, title?: string): string {
  const source = input.trim()
  const titleTag =
    title && !/<title[\s>]/i.test(source) ? `<title>${escapeHtml(title)}</title>` : ""
  const pageTag = /@page\b/i.test(source) ? "" : `<style>${FALLBACK_PAGE_CSS}</style>`
  const headExtras = `${titleTag}${pageTag}<style>${PRINT_CSS}</style>`

  if (!/<html[\s>]/i.test(source)) {
    return (
      "<!doctype html><html><head><meta charset=\"utf-8\">" +
      `<meta name="viewport" content="width=device-width, initial-scale=1">${headExtras}` +
      `</head><body>${source}</body></html>`
    )
  }

  if (/<\/head>/i.test(source)) {
    return source.replace(/<\/head>/i, `${headExtras}</head>`)
  }

  if (/<html[^>]*>/i.test(source)) {
    return source.replace(/<html[^>]*>/i, (match) => `${match}<head>${headExtras}</head>`)
  }

  return `${headExtras}${source}`
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PdfRenderError(message, "TIMEOUT")), ms)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export async function renderHtmlToPdf(html: string, opts?: { title?: string }): Promise<Buffer> {
  const docHtml = buildDocument(html, opts?.title)
  const browser = await getBrowser()
  let page: Page | undefined

  try {
    page = await browser.newPage()
    page.setDefaultTimeout(RENDER_TIMEOUT_MS)
    await page.emulateMediaType("print")

    await withTimeout(
      page.setContent(docHtml, { waitUntil: "load", timeout: RENDER_TIMEOUT_MS }),
      RENDER_TIMEOUT_MS,
      "Timed out loading HTML into Chromium",
    )

    // Best effort: webfonts should be settled before printing, but a slow or
    // broken font must not fail the whole export.
    await withTimeout(
      page.evaluate(async () => {
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
        if (fonts) await fonts.ready
      }),
      FONT_WAIT_MS,
      "Timed out waiting for webfonts",
    ).catch(() => undefined)

    const pdf = await withTimeout(
      page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0", bottom: "0", left: "0", right: "0" },
        timeout: RENDER_TIMEOUT_MS,
      }),
      RENDER_TIMEOUT_MS,
      "Timed out generating PDF",
    )

    return Buffer.from(pdf)
  } catch (err) {
    if (err instanceof PdfRenderError) throw err
    throw new PdfRenderError(`PDF rendering failed: ${errorMessage(err)}`, "RENDER_FAILED", err)
  } finally {
    if (page) {
      await page.close().catch(() => undefined)
    }
  }
}
