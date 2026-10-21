import { connection } from "next/server"


export type ModelOption = {
  id: string
  label: string
}

function prettyLabel(id: string): string {
  const known: Record<string, string> = {
    "nvidia/nemotron-3-ultra-550b-a55b:free": "Nemotron 3 Ultra · free",
    "minimax/minimax-m3.1-flash:free": "MiniMax M3.1 · free",
    "google/gemma-4-31b-it:free": "Gemma 4 31B · free",
    "anthropic/claude-sonnet-5": "Claude Sonnet 5",
    "anthropic/claude-sonnet-4.5": "Claude Sonnet 4.5",
    "anthropic/claude-opus-5": "Claude Opus 5",
    "google/gemini-3-flash-preview": "Gemini 3 Flash",
    "google/gemini-2.5-pro": "Gemini 2.5 Pro",
    "deepseek/deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
    "deepseek/deepseek-v3.2": "DeepSeek V3.2",
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o mini",
    "gpt-4.1": "GPT-4.1",
    "gpt-4.1-mini": "GPT-4.1 mini",
    "claude-sonnet-4": "Claude Sonnet 4",
    "claude-3-5-sonnet-latest": "Claude 3.5 Sonnet",
    "gemini-2.5-pro": "Gemini 2.5 Pro",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
    "deepseek-chat": "DeepSeek Chat",
    "llama-3.3-70b-versatile": "Llama 3.3 70B",
  }
  if (known[id]) return known[id]
  const [provider = "", rest = ""] = id.split("/")
  const base = (rest || provider).replace(/:free$/, "")
  const words = base
    .split(/[-_.]/)
    .filter(Boolean)
    .filter((part, index, all) => index === 0 || part.toLowerCase() !== all[0].toLowerCase())
    .map((part) => (/^[a-z]?\d/i.test(part) || part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
  return `${words.join(" ")}${id.endsWith(":free") ? " · free" : ""}`
}

export async function GET() {
  // Read env at request time instead of baking it into the static shell.
  await connection()
  const configured = (process.env.OPENAI_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean)

  const primary = process.env.OPENAI_MODEL || "gpt-4o-mini"
  const ids = Array.from(new Set([primary, ...configured]))

  const models: ModelOption[] = ids.map((id) => ({ id, label: prettyLabel(id) }))
  const mock = process.env.PAPERCLIP_MOCK === "1" || !process.env.OPENAI_API_KEY

  return Response.json({ models, default: primary, mode: mock ? "mock" : "live" })
}
