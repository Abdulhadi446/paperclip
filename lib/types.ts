export type Role = "user" | "assistant"

export type Attachment = {
  name: string
  pageCount: number
  text: string
  /** Optional rendered page previews (data URLs), used for vision models. */
  images?: string[]
}

export type ChatMessage = {
  id: string
  role: Role
  content: string
  createdAt: number
  attachment?: Attachment
  /** Model that produced this message, for the assistant. */
  model?: string
}

export type Chat = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  /** Latest generated document HTML, rendered in the preview panel. */
  html: string
  /** Title shown on the exported PDF / preview toolbar. */
  docTitle: string
}

export type ChatSummary = Pick<Chat, "id" | "title" | "docTitle" | "createdAt" | "updatedAt"> & {
  messageCount: number
  hasDocument: boolean
}
