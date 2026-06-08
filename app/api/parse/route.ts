import { z } from "zod";
import { extractFromEmail } from "@/lib/extract";
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

// One row of the dashboard: a successful extraction, or an error — per email.
export type ParseResult = {
  id: string;
  filename: string;
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

  // 2. Process each email on its own. A single failure is caught and reported
  //    as a row result, so one bad email never sinks the whole batch.
  //    Sequential on purpose: kinder to the free model's rate limit, and the
  //    test batch is small. Swap to a bounded Promise.all for larger volumes.
  const results: ParseResult[] = [];
  for (const email of parsed.data.emails) {
    const snippet = makeSnippet(email.content);
    try {
      const data = await extractFromEmail(email.content);
      results.push({ id: email.id, filename: email.filename, snippet, ok: true, data });
    } catch (error) {
      results.push({
        id: email.id,
        filename: email.filename,
        snippet,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return Response.json({ results });
}

/** Short, single-line preview of the email for the dashboard table. */
function makeSnippet(content: string, maxLength = 140): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength)}…` : oneLine;
}
