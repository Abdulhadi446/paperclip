import { NextRequest, NextResponse } from "next/server"
import { FileExtractError, MAX_FILE_BYTES, extractFile } from "@/lib/files/extract"

// Legacy PDF-only endpoint. Kept for the current client; delegates to the
// shared extractor while preserving the original response shape
// ({ pageCount, text, pages }) and error messages.
// Next 16 with cacheComponents enabled rejects route segment config exports
// (runtime, dynamic, maxDuration, revalidate). POST handlers are dynamic.

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
    const result = await extractFile(data, {
      name: upload.name || "",
      type: upload.type || "",
      kind: "pdf",
    })
    // Deliberately omit kind/name to keep the legacy payload identical.
    return NextResponse.json(
      { pageCount: result.pageCount, text: result.text, pages: result.pages },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    )
  } catch (err) {
    if (err instanceof FileExtractError) {
      console.error("[pdf/extract]", err.message)
      return NextResponse.json({ error: err.message }, { status: 422 })
    }

    console.error("[pdf/extract] unexpected error", err)
    return NextResponse.json({ error: "PDF extraction failed" }, { status: 500 })
  }
}
