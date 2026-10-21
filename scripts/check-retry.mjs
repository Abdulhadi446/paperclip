import { chromium } from "playwright-core"
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
let attempts = 0
await page.route("**/api/chat", (route) => {
  attempts += 1
  return route.abort("connectionfailed")
})
await page.goto("http://localhost:3000")
await page.waitForSelector('[data-ready="true"]', { timeout: 60000 })
await page.locator("textarea").fill("make me an invoice")
await page.locator("textarea").press("Enter")
const banner = page.locator("text=/Server unreachable, retrying/i").first()
await banner.waitFor({ timeout: 15000 })
console.log("PASS retry banner:", (await banner.innerText()).replace(/\s+/g, " ").trim())
await page.screenshot({ path: ".agent-logs/shots/retry-banner.png" })
await page.locator("text=/Server unreachable\\. Check your connection/i").first().waitFor({ timeout: 30000 })
const final = await page.locator("text=/Server unreachable\\. Check your connection/i").first().innerText()
console.log("PASS final message:", final.replace(/\s+/g, " ").trim())
console.log("attempts:", attempts)
await browser.close()
