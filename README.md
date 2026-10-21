# Paperclip — chat to PDF

Describe a document in plain language and watch it build itself, page by page, as a print-ready A4 PDF. Or upload an existing PDF and ask for edits in the same conversation. No account, no template gallery, no drag-and-drop builder.

> Built for the "chat-to-pdf" hackathon challenge in [TASK.md](./TASK.md).
>
> **Live demo:** https://f2a47304d40134.lhr.life — the free tunnel URL is temporary; see [Deployment](#deployment) to bring it back in one command.

## The problem

Making a decent-looking PDF is still absurdly slow: open a word processor, fight the layout, export, notice a typo, repeat. LLMs are good at writing and good at HTML — and HTML is the best document format nobody wants to hand-edit. Paperclip closes that loop: the model writes a complete HTML document, we render it as real A4 pages, and the exact same HTML becomes the PDF.

## Demo flow (2 minutes)

1. Open the app — you land straight in a chat. No signup.
2. Click a starter ("One-page proposal", "Invoice", …) or type *"a one-page launch brief for a habit app called Tide"*.
3. Watch the right-hand panel compose the document live as tokens stream in.
4. Ask for a change in plain language — *"make the palette warmer and add a pricing table"* — and the same document updates in place.
5. Hit **Download PDF**. That file is rendered by headless Chromium from the HTML you're looking at, A4, print backgrounds on.
6. Want to edit something you already have? **Attach PDF** — the text (and page previews) are extracted, and the model rebuilds it as editable HTML.
7. Chats and documents persist in the browser; the history rail on the left holds every document you've made.

## How it works

| Piece | Where | What it does |
| --- | --- | --- |
| Streaming chat | `app/api/chat/route.ts` | Any OpenAI-compatible endpoint, streamed to the client as plain text. The model is instructed to answer with prose + one ` ```html ` block. |
| Document parser | `lib/html.ts` | Extracts the HTML block even mid-stream, strips scripts/handlers, estimates pages, titles the doc. |
| Live preview | `components/pdf-panel.tsx` | Sandboxed iframe, real 210×297mm pages, scaled to fit, throttled while streaming. |
| PDF export | `lib/pdf/render.ts` → `app/api/pdf/export` | `puppeteer-core` + Chromium, A4, `printBackground`, singleton browser reused across requests. |
| PDF import | `lib/pdf/extract.ts` → `app/api/pdf/extract` | `pdfjs-dist` text extraction per page + `pdftoppm` page images for vision models. |
| Prompting | `lib/prompt.ts` | A4/print CSS rules, palette/font constraints the renderer supports, editing behaviour for uploaded PDFs. |

Design constraint that matters: the prompt forbids `oklch()`, webfonts and external CSS so what renders in the preview is exactly what Chromium prints.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · lucide-react · `openai` SDK against any compatible endpoint · `puppeteer-core` + Chromium · `pdfjs-dist` + poppler.

State is client-side (`localStorage`) on purpose: no auth means no user table, and a hackathon demo should not depend on a database.

## Run it locally

```bash
npm install
cp .env.example .env      # then fill in the key
npm run dev               # http://localhost:3000
```

Required environment:

```env
OPENAI_API_KEY=...                         # any OpenAI-compatible key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=anthropic/claude-sonnet-5     # model used by default
OPENAI_MODELS=...                          # optional comma-separated selector list
OPENAI_FALLBACK_MODEL=...                  # optional retry target when the first model is out of credits/rate-limited
CHROMIUM_PATH=/usr/bin/chromium            # or a chrome-headless-shell binary
```

No key? Set `PAPERCLIP_MOCK=1` and the app streams a built-in demo document so the whole UI and PDF export still work.

## Limits

- No accounts; history lives in the browser and is capped (last 40 chats, 40 messages each).
- Uploaded PDFs are read as text + first three page images, capped at 40 pages / 200k characters — not full pixel-perfect reconstruction.
- Scanned (image-only) PDFs have no text layer, so editing them depends on the page images.
- Export requires a Chromium binary on the server (`/api/pdf/health` reports whether it found one).

## Deployment

The live app runs on the `tests2` box (Ubuntu 24.04, 2 vCPU) under Node 22, reached through a temporary SSH tunnel.

```bash
# on tests2, one-time: portable Node + Chrome deps
# ~/node22            portable Node 22.23.4
# ~/cdeps             libatk & friends extracted with dpkg-deb -x (no sudo on the box)
# ~/chrome-hs         chrome-headless-shell 156

# on tests2, every deploy
cd ~/paperclip-app && git pull
PATH=$HOME/node22/bin:$PATH npm ci && PATH=$HOME/node22/bin:$PATH npm run build
bash ~/restart-app.sh          # restarts next start with LD_LIBRARY_PATH + CHROMIUM_PATH

# public URL (temporary, no interstitial) — supervised, auto-reconnects
setsid nohup bash ~/tunnel-loop.sh >/dev/null 2>&1 &
cat ~/tunnel-url.txt        # current https://<id>.lhr.life address
```

`CHROMIUM_PATH` on the server points at `~/chrome-hs/chrome-headless-shell-linux64/chrome-headless-shell`, and the process runs with `LD_LIBRARY_PATH=$HOME/cdeps/usr/lib/x86_64-linux-gnu`. `/api/pdf/health` confirms both Chromium and poppler are visible.

Cloudflare quick tunnels return 404 from this network, so the demo uses localhost.run. Free localhost.run sessions expire every ~10–15 minutes and come back on a *different* subdomain, so `~/tunnel-loop.sh` keeps one connected and rewrites `~/tunnel-url.txt` whenever the address changes: check that file for the live link. The app itself is unaffected — only the public alias rotates.

## Verification

```bash
node scripts/e2e.mjs                                  # local, http://localhost:3000
BASE_URL=https://…lhr.life node scripts/e2e.mjs       # against the deployed app
```

`node scripts/e2e.mjs` drives the built app with Playwright: generates a document, checks the live preview, downloads the PDF, uploads a PDF and edits it, reloads to prove persistence, and checks the 390px layout for overflow.
