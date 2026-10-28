# Paperclip — chat to PDF

Describe a document in plain language, answer a question or two, and watch it build itself into a print-ready A4 PDF. Or attach a PDF, Word file, markdown, CSV or text document and ask for edits in the same conversation. No account, no template gallery, no drag-and-drop builder — and no invented facts.

> Built for the "chat-to-pdf" hackathon challenge in [TASK.md](./TASK.md).
>
> **Live demo:** https://paperclip.thetrillioniar.me — no account, opens straight into the chat.
>
> **Running it:** `npm install && npm run dev`, add the env vars below, open http://localhost:3000. [Deployment](#deployment) documents how the hosted instance is served.

## The problem

Making a decent-looking PDF is still absurdly slow: open a word processor, fight the layout, export, notice a typo, repeat. LLMs are good at writing and good at HTML — and HTML is the best document format nobody wants to hand-edit. Paperclip closes that loop: the model writes a complete HTML document, we render it as real A4 pages, and the exact same HTML becomes the PDF.

## Demo flow (2 minutes)

1. Open the app — you land straight in a chat. No signup.
2. Click a starter ("One-page proposal", "Invoice", …) or type *"a one-page launch brief for a habit app called Tide"*.
3. If a fact that changes the document is missing, the assistant asks 1–4 short questions instead of inventing names, dates or amounts. Answer them in the next message.
4. Watch the right-hand panel compose the document live as tokens stream in. Content flows across as many A4 pages as it needs — nothing is cropped.
5. Ask for a change in plain language — *"make the palette warmer and add a pricing table"* — and the same document updates in place.
6. Hit **Download PDF**. That file is rendered by headless Chromium from the HTML you're looking at, A4, print backgrounds on.
7. Want to edit something you already have? **Attach file** — PDF, DOCX, TXT, MD, CSV or HTML; the text (and PDF page previews) is extracted and the model rebuilds it as editable HTML.
8. Chats and documents persist in the browser; the history rail on the left holds every document you've made.

## How it works

| Piece | Where | What it does |
| --- | --- | --- |
| Streaming chat | `app/api/chat/route.ts` | Any OpenAI-compatible endpoint, streamed to the client as plain text. The model is instructed to answer with prose + one ` ```html ` block. |
| Document parser | `lib/html.ts` | Extracts the HTML block even mid-stream, strips scripts/handlers, estimates pages, titles the doc. |
| Live preview | `components/pdf-panel.tsx` | Sandboxed iframe at true 210mm width, screen-only page margins injected, scaled to fit, throttled while streaming. |
| PDF export | `lib/pdf/render.ts` → `app/api/pdf/export` | `puppeteer-core` + Chromium, A4, `printBackground`, singleton browser reused across requests. |
| Document import | `lib/files/extract.ts` → `app/api/files/extract` | PDF via `pdfjs-dist` (+ `pdftoppm` page images for vision models), DOCX via `mammoth`, TXT/MD/CSV/HTML decoded and cleaned. |
| Prompting | `lib/prompt.ts` | Ask-before-inventing rules, flowing A4 print CSS (no fixed page boxes, no cropping), hard renderer constraints, editing behaviour. |
| Design library | `lib/templates.ts` | Eight design systems (editorial, Swiss, finance, studio, technical, gallery, poster, soft) the model picks from, adapts, or replaces with its own. |

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
- Uploads are capped at 15 MB / 200k characters (PDFs: 40 pages). PDFs are read as text + first three page images, DOCX via `mammoth`, plain-text formats decoded directly — not a pixel-perfect reconstruction.
- Scanned (image-only) PDFs have no text layer, so editing them depends on the page images and `pdftoppm` being installed on the server.
- Export requires a Chromium binary on the server (`/api/pdf/health` reports whether it found one).
- The assistant is instructed never to invent facts: when something material is missing it asks, or marks the gap as `[bracketed placeholder]` if you tell it to proceed anyway. It can still make a judgement call on tone or structure.
- While streaming, a network drop shows "Server unreachable, retrying…" and retries automatically (4 attempts, backoff) before surfacing a friendly error.

## Deployment

> Hosted on `tests2` (Ubuntu) under a named Cloudflare tunnel: **https://paperclip.thetrillioniar.me**.

The app runs on an Ubuntu box under Node 22 with a system Chromium, served through a named Cloudflare tunnel.

```bash
# on tests2, one-time: portable Node + Chrome deps
# ~/node22            portable Node 22.23.4
# ~/cdeps             libatk & friends extracted with dpkg-deb -x (no sudo on the box)
# ~/chrome-hs         chrome-headless-shell 156

# on tests2, every deploy
cd ~/paperclip-app && git pull
PATH=$HOME/node22/bin:$PATH npm ci && PATH=$HOME/node22/bin:$PATH npm run build
bash ~/restart-app.sh          # restarts next start with LD_LIBRARY_PATH + CHROMIUM_PATH

# public URLs — all supervised, all auto-reconnect
setsid nohup bash ~/cf-loop.sh      >/dev/null 2>&1 &   # stable HTTPS via a named Cloudflare tunnel
setsid nohup bash ~/bore-loop.sh    >/dev/null 2>&1 &   # plain HTTP via bore.pub, fixed port
```

`CHROMIUM_PATH` on the server points at `~/chrome-hs/chrome-headless-shell-linux64/chrome-headless-shell`, and the process runs with `LD_LIBRARY_PATH=$HOME/cdeps/usr/lib/x86_64-linux-gnu`. `/api/pdf/health` confirms both Chromium and poppler are visible.

Public access uses a **named Cloudflare tunnel**, which keeps one fixed hostname across reconnects:

```bash
cloudflared tunnel create paperclip                     # one time
cloudflared tunnel route dns --overwrite-dns <tunnel-id> paperclip.thetrillioniar.me
# ~/.cloudflared/paperclip.yml: ingress paperclip.thetrillioniar.me -> http://localhost:3000
setsid nohup bash ~/cf-loop.sh > ~/cf.log 2>&1 < /dev/null &
```

`scripts/cf-loop.sh` restarts `cloudflared` whenever it exits. Anonymous quick tunnels (`cloudflared tunnel --url …`) return 404 from some networks — a named tunnel on your own zone is the reliable option. `bore.pub` can run alongside as a plain-HTTP fallback; its fixed remote port survives reconnects.

The app itself is unaffected by the tunnel; only the public alias moves.

### Supervision

`scripts/supervise.sh` keeps the app up without a human: it starts `npm start` in `~/paperclip-app`, restarts it on any exit (2s backoff, capped at 30s), and probes `/api/pdf/health` every 30 seconds. Three failed probes in a row kill only the supervisor's own app process tree and restart it, so a hung process or a 4 AM OOM heals itself. A pidfile prevents double starts.

```bash
scp scripts/supervise.sh tests2:~/supervise.sh
ssh tests2 'setsid nohup bash ~/supervise.sh >/dev/null 2>&1 </dev/null &'
ssh tests2 'bash ~/supervise.sh --status'   # alive? last health result?
ssh tests2 'bash ~/supervise.sh --stop'     # stop supervisor + app tree
```

Supervisor events (starts, restarts, health results) go to `~/supervisor.log`; the app's own output is appended to `~/app.log`.

## Verification

```bash
node scripts/e2e.mjs                                  # local, http://localhost:3000
BASE_URL=https://your-host node scripts/e2e.mjs     # against a deployed instance
```

`node scripts/e2e.mjs` drives the built app with Playwright: generates a document, checks the live preview, downloads the PDF, uploads a PDF and edits it, reloads to prove persistence, and checks the 390px layout for overflow.
