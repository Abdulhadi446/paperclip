"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { extractDocument, extractTitle, sanitizeDocument, slugifyTitle } from "@/lib/html"
import type { Attachment, Chat, ChatMessage, ChatSummary } from "@/lib/types"
import { HistoryRail } from "@/components/history-rail"
import { ChatPanel } from "@/components/chat-panel"
import { PdfPanel } from "@/components/pdf-panel"
import { MobileBar } from "@/components/mobile-bar"

const STORAGE_KEY = "paperclip.chats.v1"
const MODEL_KEY = "paperclip.model.v1"

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

function newChat(): Chat {
  const now = Date.now()
  return {
    id: uid(),
    title: "Untitled document",
    docTitle: "Untitled document",
    createdAt: now,
    updatedAt: now,
    messages: [],
    html: "",
  }
}

function summarize(chats: Chat[]): ChatSummary[] {
  return [...chats]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((chat) => ({
      id: chat.id,
      title: chat.title,
      docTitle: chat.docTitle,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: chat.messages.length,
      hasDocument: Boolean(chat.html),
    }))
}

function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Chat[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((chat) => chat && Array.isArray(chat.messages))
  } catch {
    return []
  }
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeId, setActiveId] = useState("")
  const [ready, setReady] = useState(false)
  const [draft, setDraft] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [attachBusy, setAttachBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [models, setModels] = useState<{ id: string; label: string }[]>([])
  const [model, setModel] = useState("")
  const [mode, setMode] = useState<"live" | "mock">("live")
  const [mobileView, setMobileView] = useState<"chat" | "preview">("chat")

  const abortRef = useRef<AbortController | null>(null)
  const streamBuffer = useRef("")
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const active = useMemo(() => chats.find((chat) => chat.id === activeId) ?? null, [chats, activeId])
  const summaries = useMemo(() => summarize(chats), [chats])

  // Boot: restore chats + models.
  useEffect(() => {
    const stored = loadChats()
    if (stored.length) {
      setChats(stored)
      setActiveId(stored[0].id)
    } else {
      const chat = newChat()
      setChats([chat])
      setActiveId(chat.id)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data.models) ? data.models : []
        if (list.length) setModels(list)
        setMode(data.mode === "mock" ? "mock" : "live")
        const saved = localStorage.getItem(MODEL_KEY)
        const initial = saved && list.some((m: { id: string }) => m.id === saved) ? saved : data.default ?? list[0]?.id
        if (initial) setModel(initial)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  // Persist (skip while a stream is running so we don't thrash localStorage).
  useEffect(() => {
    if (!ready || streaming) return
    const timer = setTimeout(() => {
      try {
        const trimmed = chats.slice(0, 40).map((chat) => ({
          ...chat,
          messages: chat.messages.slice(-40).map((message) =>
            message.attachment
              ? { ...message, attachment: { ...message.attachment, text: message.attachment.text.slice(0, 20000) } }
              : message
          ),
        }))
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
      } catch {
        /* quota — ignore */
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [chats, ready, streaming])

  useEffect(() => {
    if (model) localStorage.setItem(MODEL_KEY, model)
  }, [model])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    // An empty conversation should greet the writer at the top of the page.
    if (!active?.messages.length) {
      node.scrollTop = 0
      return
    }
    node.scrollTop = node.scrollHeight
  }, [active?.messages.length, streaming])

  const patchActive = useCallback((patch: (chat: Chat) => Partial<Chat>) => {
    setChats((prev) => prev.map((chat) => (chat.id === activeId ? { ...chat, ...patch(chat), updatedAt: Date.now() } : chat)))
  }, [activeId])

  const handleNew = useCallback(() => {
    const chat = newChat()
    setChats((prev) => [chat, ...prev])
    setActiveId(chat.id)
    setDraft("")
    setAttachment(null)
    setError(null)
    setMobileView("chat")
  }, [])

  const handleSelect = useCallback((id: string) => {
    setActiveId(id)
    setAttachment(null)
    setError(null)
  }, [])

  const handleDelete = useCallback((id: string) => {
    setChats((prev) => {
      const next = prev.filter((chat) => chat.id !== id)
      if (!next.length) {
        const chat = newChat()
        setActiveId(chat.id)
        return [chat]
      }
      if (id === activeId) setActiveId(next[0].id)
      return next
    })
  }, [activeId])

  const handleAttach = useCallback(async (file: File) => {
    const supported = /\.(pdf|docx|txt|md|markdown|csv|html?)$/i.test(file.name)
    if (!supported) {
      setError("Unsupported file. Attach a PDF, Word document, text, markdown, CSV or HTML file.")
      return
    }
    setAttachBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/files/extract", { method: "POST", body })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Could not read that file.")
      }
      const data = await res.json()
      setAttachment({
        name: file.name,
        kind: data.kind ?? "pdf",
        pageCount: data.pageCount ?? 1,
        text: data.text ?? "",
        images: Array.isArray(data.pages) ? data.pages.map((p: { image?: string }) => p.image).filter(Boolean).slice(0, 3) : [],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.")
    } finally {
      setAttachBusy(false)
    }
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const send = useCallback(async () => {
    const text = draft.trim()
    if ((!text && !attachment) || streaming || !active) return

    const userMessage: ChatMessage = {
      id: uid(),
      role: "user",
      content: text || `Edit the attached document: ${attachment?.name}`,
      createdAt: Date.now(),
      attachment: attachment ?? undefined,
    }

    const history = [...active.messages, userMessage]
    const documentHtml = active.html

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === active.id
          ? {
              ...chat,
              messages: history,
              updatedAt: Date.now(),
              title: chat.messages.length === 0 ? (text.slice(0, 60) || attachment?.name || "Untitled document") : chat.title,
            }
          : chat
      )
    )

    setDraft("")
    setAttachment(null)
    setError(null)
    setStreaming(true)
    setMobileView("preview")
    streamBuffer.current = ""

    const controller = new AbortController()
    abortRef.current = controller
    let assistantId: string | null = null

    const pushAssistant = (content: string) => {
      if (!assistantId) assistantId = uid()
      const id = assistantId
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== active.id) return chat
          const exists = chat.messages.some((message) => message.id === id)
          if (!exists) {
            return {
              ...chat,
              messages: [...chat.messages, { id, role: "assistant", content, createdAt: Date.now(), model }],
            }
          }
          return {
            ...chat,
            messages: chat.messages.map((message) => (message.id === id ? { ...message, content } : message)),
          }
        })
      )
    }

    try {
      const maxAttempts = 4
      let attempt = 0
      let res: Response | null = null

      while (!res) {
        try {
          const candidate = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: history, documentHtml, model }),
            signal: controller.signal,
          })
          const transient = candidate.status === 502 || candidate.status === 503 || candidate.status === 504
          if (transient && attempt < maxAttempts - 1) {
            attempt += 1
            setError(`Server unreachable, retrying… (attempt ${attempt + 1} of ${maxAttempts})`)
            await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
            continue
          }
          res = candidate
        } catch (err) {
          if ((err as Error)?.name === "AbortError") throw err
          if (attempt >= maxAttempts - 1) {
            throw new Error("Server unreachable. Check your connection, then send again — nothing was lost.")
          }
          attempt += 1
          setError(`Server unreachable, retrying… (attempt ${attempt + 1} of ${maxAttempts})`)
          await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
        }
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }

      setError(null)

      const reader = res.body?.getReader()
      if (!reader) throw new Error("Streaming not supported by the browser.")
      const decoder = new TextDecoder()
      let lastPaint = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        streamBuffer.current += decoder.decode(value, { stream: true })
        const now = performance.now()
        if (now - lastPaint > 90) {
          lastPaint = now
          const parsed = extractDocument(streamBuffer.current)
          pushAssistant(streamBuffer.current)
          if (parsed.html) {
            const html = parsed.html
            const title = extractTitle(html)
            setChats((prev) =>
              prev.map((chat) =>
                chat.id === active.id
                  ? { ...chat, html, docTitle: title ?? chat.docTitle, updatedAt: Date.now() }
                  : chat
              )
            )
          }
        }
      }

      streamBuffer.current += decoder.decode()
      const parsed = extractDocument(streamBuffer.current)
      pushAssistant(parsed.prose ? parsed.prose + (parsed.html ? "\n\n" : "") : streamBuffer.current)

      if (parsed.html) {
        const title = extractTitle(parsed.html) ?? active.docTitle
        setChats((prev) =>
          prev.map((chat) => (chat.id === active.id ? { ...chat, html: parsed.html as string, docTitle: title, updatedAt: Date.now() } : chat))
        )
      }
      // No html block is a valid answer: the assistant is asking clarifying
      // questions instead of guessing at the user's facts.
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        const parsed = extractDocument(streamBuffer.current)
        if (streamBuffer.current.trim()) pushAssistant(parsed.prose || streamBuffer.current)
      } else if (err instanceof TypeError) {
        setError("Connection lost while composing. The partial draft above is safe — send again to continue.")
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.")
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [draft, attachment, streaming, active, model])

  const download = useCallback(async () => {
    if (!active?.html) return
    setDownloading(true)
    setError(null)
    try {
      const res = await fetch("/api/pdf/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: active.html, title: active.docTitle }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "PDF export failed.")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${slugifyTitle(active.docTitle)}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF export failed.")
    } finally {
      setDownloading(false)
    }
  }, [active])

  const docHtml = useMemo(() => (active?.html ? sanitizeDocument(active.html) : ""), [active?.html])

  return (
    <div
      className="flex h-dvh w-full flex-col overflow-hidden bg-paper text-ink"
      data-ready={ready ? "true" : "false"}
      data-streaming={streaming ? "true" : "false"}
      data-messages={active?.messages.length ?? 0}
      data-has-document={active?.html ? "true" : "false"}
    >
      <MobileBar
        chats={summaries}
        activeId={activeId}
        onSelect={(id) => {
          handleSelect(id)
          setMobileView("chat")
        }}
        onNew={handleNew}
        onDelete={handleDelete}
        view={mobileView}
        onViewChange={(next) => setMobileView(next)}
        hasDocument={Boolean(active?.html)}
      />

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[254px] shrink-0 border-r border-ink/10 xl:block">
          <HistoryRail
            chats={summaries}
            activeId={activeId}
            onSelect={handleSelect}
            onNew={handleNew}
            onDelete={handleDelete}
          />
        </div>

        <div
          className={`${
            mobileView === "chat" ? "flex" : "hidden"
          } min-w-0 flex-1 flex-col xl:flex xl:w-[clamp(400px,35vw,520px)] xl:flex-none`}
        >
          <ChatPanel
            messages={active?.messages ?? []}
            docTitle={active?.docTitle ?? "Untitled document"}
            streaming={streaming}
            draft={draft}
            onDraftChange={setDraft}
            onSend={send}
            onStop={stop}
            attachmentName={attachment ? `${attachment.name} · ${attachment.pageCount}p` : null}
            attachBusy={attachBusy}
            onAttach={handleAttach}
            onClearAttachment={() => setAttachment(null)}
            error={error}
            onSuggestion={(text) => setDraft(text)}
            models={models}
            model={model}
            onModelChange={setModel}
            scrollRef={scrollRef}
          />
        </div>

        <div className={`${mobileView === "preview" ? "flex" : "hidden"} min-w-0 flex-1 flex-col xl:flex`}>
          <PdfPanel
            html={docHtml}
            rawHtml={active?.html ?? ""}
            docTitle={active?.docTitle ?? "Untitled document"}
            generating={streaming}
            onDownload={download}
            downloading={downloading}
            mode={mode}
            onBack={() => setMobileView("chat")}
          />
        </div>
      </div>
    </div>
  )
}
