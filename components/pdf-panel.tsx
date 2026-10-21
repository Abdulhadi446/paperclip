"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Download, Loader2, Minus, Plus } from "lucide-react"

import { toPreviewDocument } from "@/lib/html"

type Props = {
  html: string
  rawHtml: string
  docTitle: string
  generating: boolean
  onDownload: () => void
  downloading: boolean
  mode: "live" | "mock"
  onBack: () => void
}

const PAGE_WIDTH_PX = 794 // 210mm at 96dpi
const PAGE_HEIGHT_PX = 1123

function useThrottled(value: string, delay: number) {
  const [shown, setShown] = useState(value)
  const latest = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    latest.current = value
    if (delay <= 0) {
      setShown(value)
      return
    }
    if (timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      setShown(latest.current)
    }, delay)
  }, [value, delay])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return shown
}

export function PdfPanel({ html, rawHtml, docTitle, generating, onDownload, downloading, mode, onBack }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [docHeight, setDocHeight] = useState(PAGE_HEIGHT_PX)
  const [zoom, setZoom] = useState(1)

  const shownHtml = useThrottled(html, generating ? 700 : 0)
  const previewHtml = useMemo(() => toPreviewDocument(shownHtml), [shownHtml])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const fitScale = containerWidth ? Math.min(1, Math.max(0.35, (containerWidth - 56) / PAGE_WIDTH_PX)) : 0.8
  const scale = fitScale * zoom

  const pageCount = Math.max(1, Math.round(docHeight / PAGE_HEIGHT_PX))
  const statusLabel = generating
    ? "Composing"
    : html
      ? `~${pageCount} ${pageCount === 1 ? "page" : "pages"}`
      : "Blank"

  return (
    <section className="flex h-full min-w-0 flex-col bg-desk">
      <header className="relative flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-ink/10 bg-[#f4efe4] px-4 xl:h-[72px] xl:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="eyebrow text-ink/45">Preview</span>
            <span className="h-px w-3 bg-ink/20" aria-hidden="true" />
            <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-ink/40">A4</span>
            {mode === "mock" && (
              <span
                title="Demo mode — no API key needed"
                className="rounded-full border border-brass/30 bg-brass/10 px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-[0.12em] text-[#7c5a27]"
              >
                demo
              </span>
            )}
          </div>
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            <h2 className="truncate font-serif text-[16px] leading-none tracking-[-0.01em] text-ink xl:text-[17px]">
              {docTitle}
            </h2>
            <span className="hidden shrink-0 rounded border border-ink/10 bg-sheet/70 px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-[0.1em] text-ink/40 sm:inline">
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <div className="hidden items-center overflow-hidden rounded-lg border border-ink/12 bg-sheet/70 sm:flex">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.6, +(value - 0.1).toFixed(2)))}
              className="flex h-8 w-7 items-center justify-center text-ink/50 transition hover:bg-ink/[0.04] hover:text-ink"
              aria-label="Zoom out"
            >
              <Minus className="h-3 w-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="h-8 w-10 font-mono text-[9px] tabular-nums text-ink/50 transition hover:text-brass"
              aria-label="Reset zoom to fit"
              title="Fit to width"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(1.6, +(value + 0.1).toFixed(2)))}
              className="flex h-8 w-7 items-center justify-center text-ink/50 transition hover:bg-ink/[0.04] hover:text-ink"
              aria-label="Zoom in"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={onDownload}
            disabled={!rawHtml || downloading}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-ink px-2.5 text-[10.5px] font-medium text-sheet shadow-[0_1px_2px_rgba(32,29,24,0.2)] transition hover:bg-[#2e2a23] active:translate-y-px disabled:opacity-30"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{downloading ? "Preparing…" : "Download PDF"}</span>
            <span className="sm:hidden">PDF</span>
          </button>
        </div>

        {generating && (
          <div className="absolute inset-x-0 bottom-0 h-px overflow-hidden" aria-hidden="true">
            <div className="h-full w-1/3 animate-progress bg-[linear-gradient(90deg,transparent,#a0783c,transparent)]" />
          </div>
        )}
      </header>

      <div
        ref={containerRef}
        className="desk-surface relative min-h-0 flex-1 overflow-auto px-3 py-5 sm:px-5 sm:py-6 xl:px-7 xl:py-7"
      >
        {!html && !generating && (
          <div className="flex min-h-full items-center justify-center py-2">
            <div className="w-full max-w-[300px] text-center">
              <div className="relative mx-auto aspect-[210/297] w-[172px] overflow-hidden rounded-[2px] bg-[#fffdf8] shadow-[0_0_0_1px_rgba(32,29,24,0.07),0_30px_60px_-32px_rgba(32,29,24,0.45),0_2px_6px_rgba(32,29,24,0.06)] sm:w-[196px]">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-brass/60" aria-hidden="true" />
                <div className="absolute inset-x-6 top-7 text-left sm:inset-x-7">
                  <div className="font-mono text-[6px] uppercase tracking-[0.26em] text-ink/25">Paperclip</div>
                  <div className="mt-2.5 h-px w-full bg-ink/10" aria-hidden="true" />
                  <p className="mt-6 font-serif text-[22px] italic leading-[1.05] text-ink/20 sm:text-[26px]">
                    Your
                    <br />
                    page.
                  </p>
                  <div className="mt-5 space-y-1.5" aria-hidden="true">
                    <div className="h-px w-full bg-ink/10" />
                    <div className="h-px w-full bg-ink/10" />
                    <div className="h-px w-4/5 bg-ink/10" />
                    <div className="h-px w-full bg-ink/10" />
                    <div className="h-px w-2/3 bg-ink/10" />
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-4 text-center font-mono text-[6px] tracking-[0.22em] text-ink/25">
                  — 1 —
                </div>
              </div>

              <h3 className="mt-6 font-serif text-[21px] leading-tight tracking-[-0.01em] text-ink/85">
                The page is still blank.
              </h3>
              <p className="mx-auto mt-1.5 max-w-[240px] text-[11px] leading-relaxed text-ink/50">
                Ask for a document in the chat. It lands here, set to A4.
              </p>
              <button
                type="button"
                onClick={onBack}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-sheet/70 px-3 py-1.5 text-[10px] font-medium text-ink/60 transition hover:border-ink/25 hover:bg-sheet hover:text-ink xl:hidden"
              >
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                Back to the chat
              </button>
            </div>
          </div>
        )}

        {generating && !html && (
          <div className="flex min-h-full items-center justify-center py-2">
            <div className="w-full max-w-[300px] text-center">
              <div className="relative mx-auto aspect-[210/297] w-[172px] overflow-hidden rounded-[2px] bg-[#fffdf8] shadow-[0_0_0_1px_rgba(32,29,24,0.07),0_30px_60px_-32px_rgba(32,29,24,0.45),0_2px_6px_rgba(32,29,24,0.06)] sm:w-[196px]">
                <div className="absolute inset-x-7 top-8 space-y-2.5" aria-hidden="true">
                  <div className="h-1 w-12 animate-pulse rounded-full bg-brass/40" />
                  <div className="h-2.5 w-4/5 animate-pulse rounded-sm bg-ink/[0.07] [animation-delay:100ms]" />
                  <div className="h-2.5 w-3/5 animate-pulse rounded-sm bg-ink/[0.07] [animation-delay:180ms]" />
                  <div className="mt-3 h-px w-full bg-ink/[0.07]" />
                  <div className="h-1.5 w-full animate-pulse rounded-sm bg-ink/[0.05] [animation-delay:220ms]" />
                  <div className="h-1.5 w-11/12 animate-pulse rounded-sm bg-ink/[0.05] [animation-delay:280ms]" />
                  <div className="h-1.5 w-4/5 animate-pulse rounded-sm bg-ink/[0.05] [animation-delay:340ms]" />
                  <div className="mt-3 h-px w-full bg-ink/[0.07]" />
                  <div className="h-1.5 w-2/3 animate-pulse rounded-sm bg-ink/[0.05] [animation-delay:380ms]" />
                </div>
                <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-1.5 font-mono text-[7px] uppercase tracking-[0.18em] text-ink/35">
                  <Loader2 className="h-2.5 w-2.5 animate-spin text-brass" aria-hidden="true" />
                  Setting
                </div>
              </div>
              <p className="mt-5 font-serif text-[17px] italic text-ink/55">Laying out your first page…</p>
            </div>
          </div>
        )}

        {shownHtml && (
          <div
            className="mx-auto animate-page-in"
            style={{ width: PAGE_WIDTH_PX * scale, height: Math.max(docHeight * scale, 120) }}
          >
            <div style={{ width: PAGE_WIDTH_PX, height: docHeight, transform: `scale(${scale})`, transformOrigin: "top left" }}>
              <iframe
                ref={frameRef}
                title="PDF preview"
                srcDoc={previewHtml}
                sandbox="allow-same-origin"
                onLoad={() => {
                  const frame = frameRef.current
                  try {
                    const height = frame?.contentDocument?.documentElement.scrollHeight ?? PAGE_HEIGHT_PX
                    if (height > 0) setDocHeight(height)
                  } catch {
                    setDocHeight(PAGE_HEIGHT_PX)
                  }
                }}
                className="block border-0 bg-white shadow-[0_0_0_1px_rgba(32,29,24,0.06),0_30px_60px_-32px_rgba(32,29,24,0.45),0_2px_6px_rgba(32,29,24,0.06)]"
                style={{ width: PAGE_WIDTH_PX, height: docHeight }}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
