"use client"

import { LockKeyhole, Paperclip, Plus, Trash2 } from "lucide-react"
import type { ChatSummary } from "@/lib/types"

type Props = {
  chats: ChatSummary[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

export function when(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function folio(index: number) {
  return String(index + 1).padStart(2, "0")
}

export function HistoryRail({ chats, activeId, onSelect, onNew, onDelete }: Props) {
  return (
    <aside className="flex h-full flex-col bg-paper">
      <div className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-ink/10 px-5 xl:h-[72px]">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-ink text-sheet shadow-[0_1px_0_rgba(255,255,255,0.16)_inset]">
          <Paperclip className="h-4 w-4 -rotate-12 text-brass-soft" aria-hidden="true" />
        </div>
        <div className="min-w-0 leading-none">
          <div className="font-serif text-[20px] leading-none tracking-[-0.015em]">
            Paperclip<span className="text-brass">.</span>
          </div>
          <div className="mt-1.5 font-mono text-[8px] uppercase leading-none tracking-[0.2em] text-ink/45">
            Chat → PDF
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={onNew}
          className="group flex w-full items-center gap-2 rounded-lg bg-ink px-3 py-2.5 text-[12.5px] font-medium text-sheet shadow-[0_1px_2px_rgba(32,29,24,0.2)] transition hover:bg-[#2e2a23] hover:shadow-[0_2px_8px_rgba(32,29,24,0.18)] active:translate-y-px"
        >
          <Plus className="h-4 w-4 text-brass-soft transition group-hover:rotate-90" aria-hidden="true" />
          New document
        </button>
      </div>

      <div className="flex items-baseline justify-between px-5 pb-2 pt-6">
        <span className="eyebrow">Library</span>
        <span className="font-mono text-[9.5px] tabular-nums text-ink/35">{String(chats.length).padStart(2, "0")}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {chats.length === 0 ? (
          <div className="mx-3 mt-2 rounded-lg border border-dashed border-ink/15 px-4 py-6 text-center">
            <div className="mx-auto mb-2.5 h-8 w-6 rounded-[2px] border border-ink/15 bg-sheet" aria-hidden="true">
              <div className="mx-auto mt-2 h-px w-3 bg-ink/15" />
              <div className="mx-auto mt-1 h-px w-3 bg-ink/15" />
            </div>
            <p className="font-serif text-[13px] leading-snug text-ink/55">Nothing filed yet.</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-ink/40">Your documents will collect here.</p>
          </div>
        ) : (
          <ul className="space-y-px">
            {chats.map((chat, index) => {
              const active = chat.id === activeId
              return (
                <li key={chat.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(chat.id)}
                    aria-current={active ? "page" : undefined}
                    className={`flex w-full min-w-0 items-start gap-2.5 rounded-lg py-2.5 pl-3 pr-10 text-left transition ${
                      active ? "bg-[#e9e2d3]" : "hover:bg-ink/[0.035]"
                    }`}
                  >
                    <span
                      className={`mt-[3px] w-4 shrink-0 font-mono text-[8.5px] tabular-nums tracking-[0.04em] transition ${
                        active ? "text-brass" : "text-ink/30 group-hover:text-brass/80"
                      }`}
                      aria-hidden="true"
                    >
                      {folio(index)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate font-serif text-[13.5px] leading-snug tracking-[-0.005em] ${
                          active ? "text-ink" : "text-ink/80 group-hover:text-ink"
                        }`}
                      >
                        {chat.docTitle || chat.title}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1 truncate font-mono text-[8.5px] uppercase tracking-[0.06em] text-ink/40">
                        <span className="shrink-0">{when(chat.updatedAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">
                          {chat.messageCount} msg{chat.messageCount === 1 ? "" : "s"}
                        </span>
                        {chat.hasDocument && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="shrink-0 text-brass/80">PDF</span>
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                  {active && (
                    <span className="pointer-events-none absolute bottom-2.5 left-0 top-2.5 w-[2px] rounded-full bg-brass" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    aria-label={`Delete ${chat.docTitle || chat.title}`}
                    title="Delete document"
                    onClick={() => onDelete(chat.id)}
                    className="absolute right-1.5 top-2.5 rounded-md p-1.5 text-ink/30 opacity-0 transition hover:bg-ink/5 hover:text-rust focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-ink/10 px-4 py-3.5">
        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-ink/45">
          <LockKeyhole className="mt-px h-3 w-3 shrink-0 text-ink/35" aria-hidden="true" />
          <span>
            No account. <span className="text-ink/60">Drafts stay in this browser.</span>
          </span>
        </p>
      </div>
    </aside>
  )
}
