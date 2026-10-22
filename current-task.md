# Current Task

## Task
Build "Paperclip" — a chat-to-PDF app for the hackathon challenge in TASK.md.

## Description
No account: land straight on a chat page. Describe a document → the agent streams a complete HTML document → it renders live as A4 pages in a side panel → one click exports a print-ready PDF. Upload a PDF to edit it: text (+ first pages as images) is extracted and injected into the model context, the model rebuilds and edits it as HTML.

Core flow (must work end to end):
- [x] Chat UI with streaming assistant output
- [x] Live A4 document preview (iframe, WYSIWYG, zoom)
- [x] Server-side HTML → PDF export (puppeteer-core + system chromium)
- [x] PDF upload → text extraction (+ page images for vision models)
- [x] Multiple chats + history persisted in localStorage
- [x] Model selector (env-driven)
- [x] UI polish pass
- [x] Real LLM verification (OpenRouter free model + fallback)
- [x] Production build + deploy to tests2 (Node 22 + chrome-headless-shell + extracted libs)
- [x] Public tunnel URL verified end to end

## Status
- [x] Done — live at https://testings.thetrillioniar.me (named Cloudflare tunnel) · plain-HTTP fallback http://bore.pub:45123
- [x] Full Playwright E2E green on the real model: generate → preview → PDF (80KB) → upload → edit → reload → 390px layout
- [x] Round 2: continuous page flow (no cropping), clarifying questions, non-PDF uploads, design library, retry UX, crash supervision
  - Pagination: 8-section test doc exported as 5 A4 pages, margins clean, end marker intact on last page
  - Clarify: "make me an invoice" → 5 numbered questions, no document; answered → 32s full invoice
  - Uploads: pdf/docx/txt/md/csv/html all extract (public docx check via bore)
  - Design library: 8 named systems + freedom to invent, no fixed template
  - Retry UX: 4 attempts, "Server unreachable, retrying… (attempt N of 4)", friendly final message
  - Supervision: `scripts/supervise.sh` on tests2, killed `next-server` → 200 again in 9s
  - Public E2E on round-2 build: ALL CHECKS PASSED (http://bore.pub:45123)
  - Named Cloudflare tunnel: https://testings.thetrillioniar.me, E2E ALL CHECKS PASSED, PDF export 92KB/1.5s

## Notes
- Logs: ./.agent-logs/
- Public URL is fixed: `scripts/cf-loop.sh` keeps the `paperclip` named tunnel connected to `testings.thetrillioniar.me`.
- `~/tunnel-url.txt` still holds a rotating localhost.run address (`~/tunnel-loop.sh`), kept only as a legacy backup.
- Mock mode: `PAPERCLIP_MOCK=1` in .env streams a built-in demo document when no key is set.
- Next 16 gotcha: `cacheComponents: true` forbids `export const runtime|dynamic` in route handlers.
