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
    context.push(`## Current document\nThis is the document the user is looking at right now.\n<current_document>\n${body.documentHtml.slice(0, 22000)}\n</current_document>`)
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
  return `Here is a first draft. Tell me what to change and I will rebuild it.

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { size: A4; margin: 16mm 16mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: #1b1b1b; background: #ffffff; font-size: 11pt; line-height: 1.6; }
  .eyebrow { font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; letter-spacing: .2em; text-transform: uppercase; color: #8a6a3b; }
  h1 { font-size: 33pt; line-height: 1.06; margin: 8mm 0 5mm; letter-spacing: -0.015em; }
  .rule { height: 2px; background: #1b1b1b; margin: 5mm 0 7mm; }
  p { margin: 0 0 4.5mm; color: #333333; }
  h2 { font-size: 14pt; margin: 8mm 0 3mm; break-after: avoid; }
  ul { margin: 0 0 5mm; padding-left: 5mm; }
  li { margin-bottom: 2mm; }
  code { font-family: ui-monospace, monospace; font-size: 9.5pt; background: #f3efe6; padding: 1px 4px; }
  .callout { border-left: 3px solid #8a6a3b; background: #faf6ee; padding: 4mm 5mm; margin: 6mm 0; break-inside: avoid; }
  .closing { margin-top: 9mm; padding-top: 4mm; border-top: 1px solid #ddd5c6; font-size: 9pt; color: #8a8378; }
</style>
</head>
<body>
  <div class="eyebrow">Paperclip demo</div>
  <h1>${title}</h1>
  <div class="rule"></div>
  <p>This is a local demo document, shown because no API key is configured yet. Add <code>OPENAI_API_KEY</code> to <code>.env</code> and the assistant will write real, tailored documents here.</p>
  <p>Paperclip asks before it invents. Give it the facts — who it is for, dates, amounts, names — and it designs a document around them. Leave a fact out and it will ask, or mark the gap as a bracket for you to fill.</p>
  <h2>What you can make</h2>
  <ul>
    <li>Proposals, briefs and reports that flow across as many A4 pages as the content needs</li>
    <li>Invoices and quotes with real numbers you supply</li>
    <li>Edited versions of a PDF, Word file, markdown, CSV or text document you attach</li>
  </ul>
  <div class="callout">
    <strong>No template lock-in.</strong> Each document picks its own type pairing, palette and structure — editorial, Swiss, financial, or something invented for the subject.
  </div>
  <p>The layout on the right is exactly what gets exported. When you are happy, press <strong>Download PDF</strong>.</p>
  <div class="closing">Paperclip · demo mode · set OPENAI_API_KEY to use a real model</div>
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
      const detail = error instanceof Error ? error.message.slice(0, 160) : String(error)
      console.warn(`[chat] ${model} failed (${detail}), retrying with ${fallbackModel}`)
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
