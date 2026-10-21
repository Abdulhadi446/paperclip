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
- [ ] UI polish pass
- [ ] Real LLM verification (needs OPENAI_API_KEY in .env)
- [ ] Production build + deploy to tests2 (needs Node 22 there; it has 18)

## Status
- [ ] In progress

## Notes
- Logs: ./.agent-logs/
- Mock mode: `PAPERCLIP_MOCK=1` in .env streams a built-in demo document when no key is set.
- Next 16 gotcha: `cacheComponents: true` forbids `export const runtime|dynamic` in route handlers.
