import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { connection, NextResponse } from "next/server"

// Cache Components would otherwise try to prerender this GET at build time;
// the binary availability check must run per request. `dynamic` is removed in
// Next 16 when cacheComponents is enabled, so connection() is the supported
// way to opt into request-time execution.

const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].filter((candidate): candidate is string => Boolean(candidate))

const PDFTOPPM_CANDIDATES = ["/usr/bin/pdftoppm", "/usr/local/bin/pdftoppm"]

async function isExecutable(candidates: string[]): Promise<boolean> {
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK)
      return true
    } catch {
      // Try the next fixed path.
    }
  }
  return false
}

export async function GET() {
  await connection()
  const [chromium, pdftoppm] = await Promise.all([
    isExecutable(CHROMIUM_CANDIDATES),
    isExecutable(PDFTOPPM_CANDIDATES),
  ])

  return NextResponse.json(
    { chromium, pdftoppm },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  )
}
