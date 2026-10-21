"use client"

import { useRef } from "react"
import { History, Paperclip, Plus, Trash2 } from "lucide-react"
import type { ChatSummary } from "@/lib/types"
import { when } from "@/components/history-rail"

type Props = {
  chats: ChatSummary[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  view: "chat" | "preview"
  onViewChange: (view: "chat" | "preview") => void
  hasDocument: boolean
}

export function MobileBar({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
  view,
  onViewChange,
  hasDocument,
}: Props) {
  const historyRef = useRef<HTMLDetailsElement | null>(null)

  const closeHistory = () => {
    if (historyRef.current) historyRef.current.open = false
  }

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-1.5 border-b border-ink/10 bg-paper px-3 xl:hidden">
      <div className="mr-auto flex min-w-0 items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-ink">
          <Paperclip className="h-3.5 w-3.5 -rotate-12 text-brass-soft" aria-hidden="true" />
        </div>
        <span className="truncate font-serif text-[17px] leading-none tracking-[-0.015em]">
          Paperclip<span className="text-brass">.</span>
        </span>
      </div>

      <div
        role="group"
        aria-label="Switch between chat and preview"
        className="flex shrink-0 items-center rounded-lg border border-ink/12 bg-[#e8e2d4] p-0.5"
      >
        <button
          type="button"
          onClick={() => onViewChange("chat")}
          aria-pressed={view === "chat"}
          className={`rounded-[5px] px-2.5 py-1 text-[10.5px] font-medium transition ${
            view === "chat" ? "bg-sheet text-ink shadow-[0_1px_2px_rgba(32,29,24,0.1)]" : "text-ink/50 hover:text-ink"
          }`}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => onViewChange("preview")}
          aria-pressed={view === "preview"}
          className={`flex items-center gap-1 rounded-[5px] px-2.5 py-1 text-[10.5px] font-medium transition ${
            view === "preview" ? "bg-sheet text-ink shadow-[0_1px_2px_rgba(32,29,24,0.1)]" : "text-ink/50 hover:text-ink"
          }`}
        >
          Preview
          {hasDocument && (
            <span
              className={`h-1 w-1 rounded-full transition ${view === "preview" ? "bg-brass" : "bg-brass/60"}`}
              aria-hidden="true"
            />
          )}
        </button>
      </div>

      <details ref={historyRef} className="relative shrink-0">
        <summary
          aria-label="Document history"
          title="History"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-ink/12 bg-sheet text-ink/55 transition hover:border-ink/20 hover:text-ink active:translate-y-px"
        >
          <History className="h-3.5 w-3.5" aria-hidden="true" />
        </summary>

        <button
          type="button"
          tabIndex={-1}
          aria-label="Close history"
          onClick={closeHistory}
          className="fixed inset-0 z-40 cursor-default bg-ink/15"
        />

        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(310px,calc(100vw-24px))] overflow-hidden rounded-xl border border-ink/12 bg-sheet shadow-[0_28px_70px_-28px_rgba(32,29,24,0.5),0_2px_8px_rgba(32,29,24,0.08)]">
          <div className="flex items-baseline justify-between border-b border-ink/10 px-3.5 py-2.5">
            <span className="eyebrow">Library</span>
            <span className="font-mono text-[9px] tabular-nums text-ink/35">{String(chats.length).padStart(2, "0")}</span>
          </div>

          <div className="max-h-[52vh] overflow-y-auto p-1.5">
            {chats.length === 0 ? (
              <p className="px-2.5 py-4 font-serif text-[13px] text-ink/50">Nothing filed yet.</p>
            ) : (
              chats.map((chat) => {
                const active = chat.id === activeId
                return (
                  <div key={chat.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(chat.id)
                        onViewChange("chat")
                        closeHistory()
                      }}
                      aria-current={active ? "page" : undefined}
                      className={`flex w-full min-w-0 items-center gap-2 rounded-lg py-2 pl-2.5 pr-10 text-left transition ${
                        active ? "bg-[#eae3d4]" : "hover:bg-ink/[0.04]"
                      }`}
                    >
                      <span className={`h-1 w-1 shrink-0 rounded-full ${chat.hasDocument ? "bg-brass" : "bg-ink/25"}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-serif text-[13px] leading-snug text-ink/85">
                          {chat.docTitle || chat.title}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[8.5px] uppercase tracking-[0.06em] text-ink/40">
                          {when(chat.updatedAt)}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${chat.docTitle || chat.title}`}
                      onClick={() => onDelete(chat.id)}
                      className="absolute right-1.5 top-2 rounded-md p-1.5 text-ink/30 transition hover:bg-ink/5 hover:text-rust"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          <div className="border-t border-ink/10 p-1.5">
            <button
              type="button"
              onClick={() => {
                onNew()
                closeHistory()
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11.5px] font-medium text-ink/75 transition hover:bg-ink/[0.04] hover:text-ink"
            >
              <Plus className="h-3.5 w-3.5 text-brass" aria-hidden="true" />
              New document
            </button>
          </div>
        </div>
      </details>

      <button
        type="button"
        onClick={onNew}
        aria-label="New document"
        title="New document"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-sheet transition hover:bg-[#2e2a23] active:translate-y-px"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </header>
  )
}
