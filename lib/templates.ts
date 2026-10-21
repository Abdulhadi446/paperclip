/**
 * A starter library of design systems, not layout templates.
 *
 * The model reads this catalog, picks whatever suits the material (or invents
 * a new system) and then writes the CSS itself. Nothing here constrains the
 * markup; it only gives the model taste anchors so successive documents do not
 * all come out looking like the same invoice.
 */

export type DesignSystem = {
  id: string
  name: string
  bestFor: string
  palette: string
  type: string
  signature: string
}

export const DESIGN_SYSTEMS: DesignSystem[] = [
  {
    id: "editorial-press",
    name: "Editorial Press",
    bestFor: "essays, briefs, proposals, anything a magazine would print",
    palette: "ink #1a1917, paper #fbf8f2, accent #8c2f1b, rule #ddd5c6",
    type: "display Georgia or 'Times New Roman' with a tight sans (Arial) for eyebrows and captions",
    signature: "hairline rules, drop cap or oversized lead paragraph, generous margins, small-caps eyebrows",
  },
  {
    id: "swiss-grid",
    name: "Swiss Grid",
    bestFor: "specs, product docs, agenda, data-heavy reports",
    palette: "black #111111, white #ffffff, signal red #d7263d, grey #6f6f6f",
    type: "Helvetica/Arial only, heavy weights, tight tracking, large numerals",
    signature: "strict left alignment, visible grid rules, numbered sections, no decoration",
  },
  {
    id: "modern-finance",
    name: "Modern Finance",
    bestFor: "invoices, quotes, financial summaries, statements",
    palette: "navy #12263a, slate #5b6b7b, pale #f4f6f8, accent #2f6f5e",
    type: "clean sans (Arial/Helvetica) with tabular figures and a serif accent for the amount",
    signature: "right-aligned money column, thin dividers, totals block with a tinted band, precise spacing",
  },
  {
    id: "warm-studio",
    name: "Warm Studio",
    bestFor: "creative proposals, menus, invitations, brand one-pagers",
    palette: "cream #f7efe3, terracotta #b4552d, olive #6b6a3c, charcoal #2b2724",
    type: "humanist serif display with an italic accent and a quiet sans for body",
    signature: "generous whitespace, centred or asymmetric title block, small ornaments, tinted panels",
  },
  {
    id: "technical-spec",
    name: "Technical Spec",
    bestFor: "API docs, engineering reports, runbooks, checklists",
    palette: "graphite #1f2328, ice #f6f8fa, blue #0969da, border #d0d7de",
    type: "mono (ui-monospace) for labels and code, sans for prose",
    signature: "labelled fields, boxed callouts, code blocks, table-first structure",
  },
  {
    id: "gallery-minimal",
    name: "Gallery Minimal",
    bestFor: "portfolios, lookbooks, art/photo briefs, luxury collateral",
    palette: "off-white #faf9f6, true black #0c0c0c, warm grey #a8a29a",
    type: "one serif family only, wide tracking on caps, very large headline, small body",
    signature: "vast negative space, centred captions, hairline frames, images given room",
  },
  {
    id: "bold-poster",
    name: "Bold Poster",
    bestFor: "event flyers, launch announcements, one-page manifestos",
    palette: "electric #ff4d1a on #111111, cream #f2ead9, accent #f6c445",
    type: "condensed grotesque headlines at 40pt+, tiny caps for detail",
    signature: "full-bleed colour blocks, stacked headline, hard edges, one loud accent",
  },
  {
    id: "soft-report",
    name: "Soft Report",
    bestFor: "research summaries, HR/people docs, roadmaps, healthcare",
    palette: "sage #e8efe6, forest #2f4a3c, sand #f6f1e7, muted coral #c97b63",
    type: "rounded sans (ui-sans-serif) with a gentle serif for section titles",
    signature: "tinted cards, soft rules, spacious line height, callout boxes with left accent bars",
  },
]

export function designLibraryPrompt(): string {
  return DESIGN_SYSTEMS.map(
    (system) =>
      `- ${system.name} — best for ${system.bestFor}. Palette: ${system.palette}. Type: ${system.type}. Signature moves: ${system.signature}.`,
  ).join("\n")
}
