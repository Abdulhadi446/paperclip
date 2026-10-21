import OpenAI from "openai"
import { PDF_SYSTEM_PROMPT, buildSupportingContext } from "@/lib/prompt"
import type { ChatMessage } from "@/lib/types"


type Body = {
  messages: ChatMessage[]
  documentHtml?: string
  model?: string
}

/**
 * Assistant history carries complete HTML documents. Sending every past
 * document back would blow up the context window, so only prose is replayed
 * and the live document is attached once in the system context.
 */
function stripDocument(text: string): string {
  const prose = text.replace(/```html[\s\S]*?(```|$)/gi, "").replace(/\n{3,}/g, "\n\n").trim()
  return prose || "(document updated)"
}

function buildMessages(body: Body) {
  const messages = body.messages ?? []
  const lastUser = [...messages].reverse().find((m) => m.role === "user")
  const context: string[] = []

  if (body.documentHtml?.trim()) {
    context.push(`## Current document\nThis is the document the user is looking at right now.\n<current_document>\n${body.documentHtml.slice(0, 45000)}\n</current_document>`)
  }

  const attachmentContext = buildSupportingContext(lastUser?.attachment)
  if (attachmentContext) context.push(attachmentContext)

  const system = context.length ? `${PDF_SYSTEM_PROMPT}\n\n${context.join("\n\n")}` : PDF_SYSTEM_PROMPT

  const history = messages.slice(-16).map((message) => {
    if (message.role === "assistant") {
      return { role: "assistant" as const, content: stripDocument(message.content) }
    }
    return { role: "user" as const, content: message.content }
  })

  return [{ role: "system" as const, content: system }, ...history]
}

function mockDocument(prompt: string) {
  const title = prompt.slice(0, 70).replace(/[<>&]/g, " ") || "Untitled document"
  return `Here is a first draft. I kept it to one page so you can tell me what to change.

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: #1b1b1b; background: #ffffff; }
  .page { width: 210mm; height: 297mm; padding: 18mm; position: relative; overflow: hidden; break-after: page; }
  .page:last-child { break-after: auto; }
  .eyebrow { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; letter-spacing: .18em; text-transform: uppercase; color: #8a6a3b; }
  h1 { font-size: 34pt; line-height: 1.05; margin: 10mm 0 6mm; }
  .rule { height: 2px; background: #1b1b1b; width: 100%; margin: 6mm 0; }
  p { font-size: 11.5pt; line-height: 1.65; color: #333333; }
  .footer { position: absolute; bottom: 12mm; left: 18mm; right: 18mm; display: flex; justify-content: space-between; font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #888888; border-top: 1px solid #dddddd; padding-top: 3mm; }
</style>
</head>
<body>
  <section class="page">
    <div class="eyebrow">Paperclip demo</div>
    <h1>${title}</h1>
    <div class="rule"></div>
    <p>This is a local demo document, shown because no API key is configured yet. Add <strong>OPENAI_API_KEY</strong> to <code>.env</code> and the assistant will write real, tailored documents here.</p>
    <p>Try asking for a proposal, a resume, an invoice, a one-pager or a report. You can also upload a PDF and ask for edits — the layout you see on the right is exactly what gets exported.</p>
    <div class="footer"><span>Paperclip</span><span>Page 1 of 1</span></div>
  </section>
</body>
</html>
\`\`\`
`
}

function textStream(text: string) {
  const chunks = text.match(/[\s\S]{1,24}/g) ?? []
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
        await new Promise((resolve) => setTimeout(resolve, 12))
      }
      controller.close()
    },
  })
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const messages = body.messages ?? []
  const lastUser = [...messages].reverse().find((m) => m.role === "user")
  if (!lastUser) return Response.json({ error: "No user message" }, { status: 400 })

  const apiKey = process.env.OPENAI_API_KEY
  const mock = process.env.PAPERCLIP_MOCK === "1" || !apiKey

  if (mock) {
    return new Response(textStream(mockDocument(lastUser.content)), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "x-paperclip-mode": "mock",
      },
    })
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  })

  const model = body.model || process.env.OPENAI_MODEL || "gpt-4o-mini"
  const fallbackModel = process.env.OPENAI_FALLBACK_MODEL?.trim() || undefined
  const encoder = new TextEncoder()

  const generate = async (useModel: string) =>
    client.chat.completions.create({
      model: useModel,
      messages: buildMessages(body) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      stream: true,
      temperature: 0.7,
      max_tokens: 8000,
    })

  try {
    let completion
    try {
      completion = await generate(model)
    } catch (error) {
      if (!fallbackModel || fallbackModel === model) throw error
      console.warn(`[chat] ${model} failed, retrying with ${fallbackModel}`)
      completion = await generate(fallbackModel)
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content
            if (delta) controller.enqueue(encoder.encode(delta))
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Stream failed"
          controller.enqueue(encoder.encode(`\n\n[stream error: ${message}]`))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "x-paperclip-mode": "live",
        "x-paperclip-model": model,
      },
    })
  } catch (error) {
    console.error("[chat]", error)
    const message = error instanceof Error ? error.message : "LLM request failed"
    return Response.json({ error: message }, { status: 502 })
  }
}
