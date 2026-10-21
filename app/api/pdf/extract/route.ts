import { NextRequest, NextResponse } from "next/server"
import { PdfExtractError, extractPdf } from "@/lib/pdf/extract"

// Next 16 with cacheComponents enabled rejects route segment config exports
// (runtime, dynamic, maxDuration, revalidate). POST handlers are dynamic.

const MAX_FILE_BYTES = 15 * 1024 * 1024

function isPdfUpload(name: string, type: string, data: Buffer): boolean {
  const mimeOk = type === "application/pdf" || type === "application/x-pdf"
  // Some clients send application/octet-stream, so also accept the extension.
  const extOk = name.toLowerCase().endsWith(".pdf")
  if (!mimeOk && !extOk) return false

  // PDF header may be preceded by a small amount of junk in malformed files.
  return data.subarray(0, 1024).includes(Buffer.from("%PDF-"))
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || ""
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a `file` field" },
      { status: 415 },
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Could not parse multipart body" }, { status: 400 })
  }

  const file = form.get("file")
  if (
    !file ||
    typeof file === "string" ||
    typeof (file as Blob).arrayBuffer !== "function"
  ) {
    return NextResponse.json({ error: "Missing `file` upload" }, { status: 400 })
  }

  const upload = file as File
  if (upload.size === 0) {
    return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 })
  }

  if (upload.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 15MB limit" }, { status: 413 })
  }

  const data = Buffer.from(await upload.arrayBuffer())
  if (!isPdfUpload(upload.name || "", upload.type || "", data)) {
    return NextResponse.json({ error: "File must be a PDF" }, { status: 415 })
  }

  try {
    const result = await extractPdf(data)
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (err) {
    if (err instanceof PdfExtractError) {
      console.error("[pdf/extract]", err.message)
      return NextResponse.json({ error: err.message }, { status: 422 })
    }

    console.error("[pdf/extract] unexpected error", err)
    return NextResponse.json({ error: "PDF extraction failed" }, { status: 500 })
  }
}
