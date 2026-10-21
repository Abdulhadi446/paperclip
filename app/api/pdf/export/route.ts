import { NextRequest, NextResponse } from "next/server"
import { PdfRenderError, renderHtmlToPdf } from "@/lib/pdf/render"

// Next 16 with cacheComponents enabled rejects route segment config exports
// (runtime, dynamic, maxDuration, revalidate). POST handlers are dynamic.

const MAX_HTML_BYTES = 2 * 1024 * 1024
const MAX_TITLE_LENGTH = 200

function slugify(title: string | undefined): string {
  const base = (title || "document")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)

  return base || "document"
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 })
  }

  const { html, title } = body as { html?: unknown; title?: unknown }

  if (typeof html !== "string" || html.trim().length === 0) {
    return NextResponse.json({ error: "`html` must be a non-empty string" }, { status: 400 })
  }

  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    return NextResponse.json({ error: "`html` exceeds the 2MB limit" }, { status: 413 })
  }

  if (title !== undefined && typeof title !== "string") {
    return NextResponse.json({ error: "`title` must be a string" }, { status: 400 })
  }

  const safeTitle = title?.slice(0, MAX_TITLE_LENGTH).trim() || undefined

  try {
    const pdf = await renderHtmlToPdf(html, { title: safeTitle })
    const bytes = new Uint8Array(pdf)
    const filename = `${slugify(safeTitle)}.pdf`

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    if (err instanceof PdfRenderError) {
      const status = err.code === "TIMEOUT" ? 504 : 500
      console.error("[pdf/export]", err.code, err.message)
      return NextResponse.json({ error: err.message, code: err.code }, { status })
    }

    console.error("[pdf/export] unexpected error", err)
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 })
  }
}
