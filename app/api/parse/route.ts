import { z } from "zod";
import { extractFromEmail } from "@/lib/extract";
import { parseEmail } from "@/lib/parseEmail";
import type { EmailExtraction } from "@/lib/schema";

// Shape of the request body the frontend sends: a batch of raw emails.
const ParseRequestSchema = z.object({
  emails: z
    .array(
      z.object({
        id: z.string(),
        filename: z.string(),
        content: z.string(),
      }),
    )
    .min(1, "Send at least one email."),
});

export type Sender = { name: string; address: string } | null;

// One row of the dashboard: a successful extraction, or an error — per email.
export type ParseResult = {
  id: string;
  filename: string;
  from: Sender;
  snippet: string;
} & ({ ok: true; data: EmailExtraction } | { ok: false; error: string });

export async function POST(request: Request): Promise<Response> {
  // 1. Parse and validate the request body with Zod (reject bad input early).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = ParseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Request body does not match the expected shape." },
      { status: 400 },
    );
  }

  // 2. Decode each .eml (MIME), then extract. Each email is isolated so one
  //    failure becomes a row result instead of crashing the whole batch.
  const results: ParseResult[] = [];
  for (const email of parsed.data.emails) {
    // Decode MIME so the model gets real text and the UI gets the sender,
    // falling back to the raw content if parsing somehow fails.
    let from: Sender = null;
    let cleanText = email.content;
    let snippet = makeSnippet(email.content);
    try {
      const mail = await parseEmail(email.content);
      from = mail.from;
      cleanText = `Subject: ${mail.subject}\n\n${mail.body}`.trim();
      // Decoded body (or subject) — never the raw headers, so an empty email
      // shows a clean blank rather than its MIME envelope.
      snippet = makeSnippet(mail.body || mail.subject);
    } catch {
      // keep the raw fallbacks set above
    }

    try {
      const data = await extractFromEmail(cleanText);
      results.push({ id: email.id, filename: email.filename, from, snippet, ok: true, data });
    } catch (error) {
      results.push({
        id: email.id,
        filename: email.filename,
        from,
        snippet,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return Response.json({ results });
}

/** Short, single-line preview of the decoded email body for the dashboard table. */
function makeSnippet(content: string, maxLength = 140): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength)}…` : oneLine;
}
