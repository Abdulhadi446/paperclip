"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import {
  ArrowUp,
  ChevronDown,
  FileText,
  Loader2,
  LockKeyhole,
  Paperclip,
  Square,
  TriangleAlert,
  X,
} from "lucide-react"
import type { ChatMessage } from "@/lib/types"

type ModelOption = { id: string; label: string }

type Props = {
  messages: ChatMessage[]
  docTitle: string
  streaming: boolean
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  attachmentName: string | null
  attachBusy: boolean
  onAttach: (file: File) => void
  onClearAttachment: () => void
  error: string | null
  onSuggestion: (text: string) => void
  models: ModelOption[]
  model: string
  onModelChange: (model: string) => void
  scrollRef: RefObject<HTMLDivElement | null>
}

const SUGGESTIONS = [
  {
    title: "One-page proposal",
    blurb: "Scope, timeline and pricing for a brand refresh.",
    prompt: "Create a one-page consulting proposal for a brand refresh, with scope, timeline and pricing.",
  },
  {
    title: "Resume",
    blurb: "Five years of product design at fintech startups.",
    prompt: "Write a crisp one-page resume for a product designer with 5 years of experience at fintech startups.",
  },
  {
    title: "Invoice",
    blurb: "32 hours at $95/hour, billed to Northwind Studio.",
    prompt: "Make a clean freelance invoice for 32 hours of design work at $95/hour, billed to Northwind Studio.",
  },
  {
    title: "Launch brief",
    blurb: "A two-page brief for a habit app called Tide.",
    prompt: "Draft a two-page product launch brief for a habit-tracking app called Tide.",
  },
]

function clock(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

export function ChatPanel({
  messages,
  docTitle,
  streaming,
  draft,
  onDraftChange,
  onSend,
  onStop,
  attachmentName,
  attachBusy,
  onAttach,
  onClearAttachment,
  error,
  onSuggestion,
  models,
  model,
  onModelChange,
  scrollRef,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [elapsed, setElapsed] = useState(0)

  // A visible clock makes a 40s generation feel like progress instead of a stall.
  useEffect(() => {
    if (!streaming) {
      setElapsed(0)
      return
    }
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [streaming])

  const handleFile = (files: FileList | null) => {
    const file = files?.[0]
    if (file) onAttach(file)
  }

  const chooseSuggestion = (prompt: string) => {
    onSuggestion(prompt)
    requestAnimationFrame(() => {
      const node = textareaRef.current
      if (!node) return
      node.focus()
      node.setSelectionRange(prompt.length, prompt.length)
    })
  }

  return (
    <section className="flex h-full min-w-0 flex-col border-r border-ink/10 bg-sheet">
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-ink/10 px-5 xl:h-[72px] xl:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-brass" aria-hidden="true" />
            <span className="eyebrow">Current draft</span>
          </div>
          <div className="mt-1.5 flex min-w-0 items-baseline gap-2">
            <h1 className="truncate font-serif text-[17px] leading-none tracking-[-0.01em] text-ink xl:text-[19px]">
              {docTitle}
            </h1>
            <span className="hidden shrink-0 font-mono text-[8px] uppercase tracking-[0.14em] text-ink/30 sm:inline">
              A4 · PDF
            </span>
          </div>
        </div>

        <span
          aria-live="polite"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-ink/10 bg-paper/60 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-ink/50"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${streaming ? "animate-pulse bg-brass" : "bg-[#8a9271]"}`}
            aria-hidden="true"
          />
          {streaming ? (elapsed >= 2 ? `Composing · ${elapsed}s` : "Composing") : "Ready"}
        </span>
      </header>

      <div
        ref={scrollRef}
        role="region"
        aria-label="Conversation"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5 xl:px-6"
      >
        {messages.length === 0 ? (
          <div className="mx-auto w-full max-w-[540px] pb-6 pt-1 sm:pt-3">
            <div className="animate-rise">
              <div className="flex items-center gap-2.5">
                <span className="h-px w-7 bg-brass/60" aria-hidden="true" />
                <span className="eyebrow">A fresh page · A4</span>
              </div>
              <h2 className="mt-4 font-serif text-[30px] leading-[1.02] tracking-[-0.025em] text-ink sm:text-[34px]">
                What should we
                <br />
                put on <em className="italic text-brass">paper?</em>
              </h2>
              <p className="mt-3 max-w-[42ch] text-[12.5px] leading-[1.7] text-ink/55">
                Describe the document you need and it takes shape on the right, page by page. Already have a PDF?
                Attach it and ask for changes in plain language.
              </p>
            </div>

            <div className="mt-7 animate-rise [animation-delay:120ms]">
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <span className="eyebrow">Start from a shape</span>
                <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink/30">Four starters</span>
              </div>
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-ink/12 bg-ink/10 sm:grid-cols-2">
                {SUGGESTIONS.map((item, index) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => chooseSuggestion(item.prompt)}
                    className="group flex min-h-[80px] flex-col justify-between gap-2.5 bg-sheet px-3.5 py-3 text-left transition hover:bg-white focus-visible:z-10 focus-visible:outline-offset-[-4px] sm:min-h-[96px] sm:gap-3"
                  >
                    <span className="flex w-full items-start justify-between gap-2">
                      <span className="font-serif text-[14.5px] leading-[1.15] tracking-[-0.01em] text-ink">
                        {item.title}
                      </span>
                      <span
                        className="mt-0.5 shrink-0 font-mono text-[8.5px] tabular-nums text-ink/25 transition group-hover:text-brass"
                        aria-hidden="true"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </span>
                    <span className="line-clamp-2 text-[11px] leading-[1.55] text-ink/50 transition group-hover:text-ink/65">
                      {item.blurb}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2.5 hidden font-mono text-[8px] uppercase tracking-[0.12em] text-ink/30 sm:block">
                Pick one to fill the composer
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[560px] space-y-6">
            {messages.map((message, index) => {
              const isStreaming = streaming && index === messages.length - 1 && message.role === "assistant"
              const label = models.find((option) => option.id === message.model)?.label
              const prose = message.content.replace(/```html[\s\S]*?(```|$)/gi, "").trim()
              const updatedDocument = message.content.includes("```html")

              if (message.role === "user") {
                return (
                  <article key={message.id} className="flex animate-rise justify-end">
                    <div className="min-w-0 max-w-[88%] rounded-lg border border-ink/10 border-l-2 border-l-brass/70 bg-[#ebe4d5] px-3.5 py-2.5">
                      <div className="mb-1 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-ink/40">
                        <span>You</span>
                        <span aria-hidden="true" className="text-ink/20">
                          ·
                        </span>
                        <span className="tabular-nums">{clock(message.createdAt)}</span>
                      </div>
                      {message.attachment && (
                        <div className="mb-1.5 flex max-w-full items-center gap-1.5 rounded border border-ink/10 bg-sheet/70 px-2 py-1 font-mono text-[9px] text-ink/55">
                          <FileText className="h-3 w-3 shrink-0 text-brass" aria-hidden="true" />
                          <span className="truncate">{message.attachment.name}</span>
                          <span className="shrink-0 text-ink/35">· {message.attachment.pageCount}p</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words text-[12.5px] leading-[1.65] text-ink/85">
                        {message.content}
                      </p>
                    </div>
                  </article>
                )
              }

              return (
                <article key={message.id} className="min-w-0 animate-rise">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-brass/35 bg-brass/10 text-brass">
                      <Paperclip className="h-2.5 w-2.5 -rotate-12" aria-hidden="true" />
                    </span>
                    <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.14em] text-ink/45">
                      Paperclip
                    </span>
                    {label && (
                      <span className="min-w-0 truncate font-mono text-[8px] uppercase tracking-[0.08em] text-ink/30">
                        {label}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-[1.72] text-ink/75">
                    {prose || <span className="italic text-ink/40">Setting the page…</span>}
                    {isStreaming && (
                      <span
                        className="ml-0.5 inline-block h-[0.95em] w-[2px] animate-pulse bg-brass align-[-0.12em]"
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  {updatedDocument && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded border border-brass/25 bg-brass/[0.07] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#7c5a27]">
                      <FileText className="h-3 w-3" aria-hidden="true" />
                      Document updated
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-ink/10 bg-paper px-4 pb-3 pt-3 sm:px-5 xl:px-6">
        {error && (
          <div
            role="alert"
            className="mx-auto mb-2.5 flex w-full max-w-[560px] items-start gap-2 rounded-lg border border-rust/25 bg-rust/[0.06] px-3 py-2 text-[11px] leading-relaxed text-rust"
          >
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        <div className="mx-auto w-full max-w-[560px]">
          {attachmentName && (
            <div className="mb-2 flex w-full min-w-0 items-center gap-2 rounded-lg border border-brass/30 bg-brass/[0.07] px-2.5 py-1.5">
              <FileText className="h-3.5 w-3.5 shrink-0 text-brass" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink/75">{attachmentName}</span>
              <span className="hidden shrink-0 font-mono text-[8px] uppercase tracking-[0.12em] text-brass/80 sm:inline">
                Attached
              </span>
              <button
                type="button"
                onClick={onClearAttachment}
                aria-label="Remove attachment"
                className="-mr-0.5 rounded p-1 text-ink/35 transition hover:bg-ink/5 hover:text-rust"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="rounded-xl border border-ink/15 bg-sheet shadow-[0_1px_2px_rgba(32,29,24,0.04),0_18px_40px_-30px_rgba(32,29,24,0.35)] transition focus-within:border-brass/55 focus-within:ring-2 focus-within:ring-brass/15">
            <label htmlFor="composer" className="sr-only">
              Describe the document you want
            </label>
            <textarea
              ref={textareaRef}
              id="composer"
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  onSend()
                }
              }}
              rows={3}
              placeholder="Describe the document you need…"
              className="composer-field block min-h-[86px] w-full resize-none bg-transparent px-3.5 pb-1 pt-3 font-serif text-[14.5px] leading-[1.55] text-ink outline-none placeholder:italic placeholder:text-ink/30 sm:px-4"
            />

            <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-0.5">
              <div className="flex min-w-0 items-center gap-0.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(event) => {
                    handleFile(event.target.files)
                    event.target.value = ""
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={attachBusy}
                  aria-label="Attach a PDF"
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-medium text-ink/55 transition hover:bg-ink/[0.04] hover:text-ink disabled:opacity-40"
                >
                  {attachBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {attachBusy ? "Reading…" : "Attach PDF"}
                </button>

                <span className="mx-1 h-3.5 w-px shrink-0 bg-ink/10" aria-hidden="true" />

                <label className="relative flex min-w-0 items-center">
                  <span className="sr-only">Model</span>
                  <select
                    value={model}
                    onChange={(event) => onModelChange(event.target.value)}
                    disabled={models.length === 0}
                    className="max-w-[132px] appearance-none truncate rounded-md bg-transparent py-1 pl-1.5 pr-5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink/45 transition hover:bg-ink/[0.03] hover:text-ink/70 disabled:opacity-50"
                  >
                    {models.length === 0 && <option value="">Loading…</option>}
                    {models.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-1 h-3 w-3 text-ink/30"
                    aria-hidden="true"
                  />
                </label>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden font-mono text-[8px] uppercase tracking-[0.1em] text-ink/30 sm:inline">
                  Enter to send
                </span>
                {streaming ? (
                  <button
                    type="button"
                    onClick={onStop}
                    className="flex h-8 items-center gap-1.5 rounded-full border border-ink/20 px-3 text-[10.5px] font-medium text-ink/70 transition hover:border-ink/35 hover:bg-sheet hover:text-ink"
                  >
                    <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSend}
                    disabled={!draft.trim() && !attachmentName}
                    aria-label="Send message"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sheet shadow-[0_1px_2px_rgba(32,29,24,0.2)] transition hover:bg-brass active:translate-y-px disabled:bg-ink/20 disabled:shadow-none"
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 hidden items-center justify-between gap-3 px-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-ink/30 sm:flex">
            <span className="flex items-center gap-1.5">
              <LockKeyhole className="h-2.5 w-2.5" aria-hidden="true" />
              Drafts stay in this browser
            </span>
            <span>Shift + Enter for a new line</span>
          </div>
        </div>
      </div>
    </section>
  )
}
