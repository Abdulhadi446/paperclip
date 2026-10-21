// End-to-end smoke test for the core flow: generate → preview → export → edit → persistence.
// Run: node scripts/e2e.mjs   (app must be running on localhost:3000)
import { chromium } from "playwright-core"
import fs from "node:fs/promises"
import path from "node:path"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const SHOTS = path.resolve(".agent-logs/shots")
const OUT = path.resolve(".agent-logs/e2e")
await fs.mkdir(SHOTS, { recursive: true })
await fs.mkdir(OUT, { recursive: true })

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args)
let failures = 0
const check = (name, ok, extra = "") => {
  log(ok ? "PASS" : "FAIL", name, extra)
  if (!ok) failures++
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
})
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await context.newPage()
page.on("console", (msg) => {
  if (msg.type() === "error") log("console.error:", msg.text().slice(0, 200))
})
page.on("pageerror", (err) => log("pageerror:", err.message.slice(0, 300)))

const previewTextLength = () =>
  page.evaluate(() => {
    const frame = document.querySelector("iframe")
    try {
      return (frame?.contentDocument?.body?.innerText ?? "").trim().length
    } catch {
      return 0
    }
  })

const streaming = () => page.getAttribute("[data-streaming]", "data-streaming")

const previewText = () =>
  page.evaluate(() => {
    const frame = document.querySelector("iframe")
    try {
      return (frame?.contentDocument?.body?.innerText ?? "").replace(/\s+/g, " ").trim()
    } catch {
      return ""
    }
  })

const waitGeneration = async (label, timeout = 300_000) => {
  await page
    .waitForFunction(() => document.querySelector("[data-streaming]")?.getAttribute("data-streaming") === "true", null, {
      timeout: 15_000,
      polling: 100,
    })
    .catch(() => log(`note: ${label} never reported streaming=true`))
  await page.waitForFunction(
    () => document.querySelector("[data-streaming]")?.getAttribute("data-streaming") === "false",
    null,
    { timeout, polling: 400 }
  )
}

const sendPrompt = async (text, label = "generation") => {
  const before = Number(await page.getAttribute("[data-messages]", "data-messages"))
  await page.locator("textarea").first().fill(text)
  await page.locator("textarea").first().press("Enter")
  await page
    .waitForFunction(
      (n) => Number(document.querySelector("[data-messages]")?.getAttribute("data-messages")) > n,
      before,
      { timeout: 30_000, polling: 150 }
    )
    .catch(() => log(`note: no new message appeared for ${label}`))
  await waitGeneration(label)
  await page.waitForTimeout(500)
}

try {
  log("open", BASE)
  await page.goto(BASE, { waitUntil: "domcontentloaded" })
  await page.waitForSelector("textarea", { timeout: 30_000 })
  await page.screenshot({ path: `${SHOTS}/e2e-01-empty.png` })
  check("empty state renders", (await page.locator("textarea").count()) === 1)

  log("generate a document")
  const started = Date.now()
  await sendPrompt("A one-page launch brief for a habit-tracking app called Tide")
  await page.waitForFunction(
    () => {
      const frame = document.querySelector("iframe")
      try {
        return (frame?.contentDocument?.body?.innerText ?? "").trim().length > 300
      } catch {
        return false
      }
    },
    null,
    { timeout: 300_000, polling: 500 }
  )
  const firstPreview = await previewTextLength()
  check("preview rendered from live stream", firstPreview > 300, `${firstPreview} chars in ${Math.round((Date.now() - started) / 1000)}s`)
  await page.screenshot({ path: `${SHOTS}/e2e-02-streaming.png` })

  await waitGeneration("generate")
  const generatedHtml = await page.evaluate(() => {
    const frame = document.querySelector("iframe")
    return frame?.contentDocument?.documentElement?.outerHTML ?? ""
  })
  await fs.writeFile(`${OUT}/generated.html`, generatedHtml)
  const generatedText = await previewText()
  check("document finished streaming", generatedHtml.length > 1000, `${generatedHtml.length} bytes`)
  await page.screenshot({ path: `${SHOTS}/e2e-03-generated.png` })

  log("export pdf")
  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 })
  await page.getByRole("button", { name: /download pdf/i }).click()
  const download = await downloadPromise
  const pdfPath = `${OUT}/${download.suggestedFilename()}`
  await download.saveAs(pdfPath)
  const bytes = (await fs.stat(pdfPath)).size
  check("pdf downloaded", bytes > 5000, `${download.suggestedFilename()} · ${bytes} bytes`)
  const errors = await page.locator("text=/export failed|request failed/i").count()
  check("no export error banner", errors === 0)

  log("upload a pdf and edit it")
  const uploadPdf = path.resolve(".agent-logs/test.pdf")
  await page.locator('input[type="file"]').setInputFiles(uploadPdf)
  await page.waitForFunction(() => document.body.innerText.includes("test.pdf"), null, { timeout: 60_000, polling: 300 })
  check("attachment chip appears", true)
  await sendPrompt("Keep the same content but tighten the layout into a single page.", "edit")
  await page
    .waitForFunction(
      (before) => {
        const frame = document.querySelector("iframe")
        try {
          const now = (frame?.contentDocument?.body?.innerText ?? "").replace(/\s+/g, " ").trim()
          return now.length > 250 && now !== before
        } catch {
          return false
        }
      },
      generatedText,
      { timeout: 240_000, polling: 500 }
    )
    .catch(() => log("note: preview text did not change after the edit"))
  const editedText = await previewText()
  await fs.writeFile(`${OUT}/edited.txt`, editedText)
  check(
    "edited document changed",
    editedText.length > 250 && editedText !== generatedText,
    `${editedText.length} chars vs ${generatedText.length} before`
  )
  await page.screenshot({ path: `${SHOTS}/e2e-04-edited.png` })

  log("persistence")
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForSelector("textarea", { timeout: 30_000 })
  await page
    .waitForFunction(
      () => {
        const frame = document.querySelector("iframe")
        try {
          return (frame?.contentDocument?.body?.innerText ?? "").trim().length > 100
        } catch {
          return false
        }
      },
      null,
      { timeout: 30_000, polling: 300 }
    )
    .catch(() => log("note: preview did not come back after reload"))
  const restored = await page.evaluate(() => {
    const frame = document.querySelector("iframe")
    try {
      return (frame?.contentDocument?.body?.innerText ?? "").trim().length
    } catch {
      return 0
    }
  })
  check("document restored after reload", restored > 100, `${restored} chars`)
  await page.screenshot({ path: `${SHOTS}/e2e-05-restored.png` })

  log("mobile layout")
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(600)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check("no horizontal overflow at 390px", overflow <= 1, `${overflow}px`)
  await page.screenshot({ path: `${SHOTS}/e2e-06-mobile.png` })
} catch (error) {
  failures++
  log("FATAL", error.message)
  await page.screenshot({ path: `${SHOTS}/e2e-failure.png` }).catch(() => {})
} finally {
  await browser.close()
}

log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
