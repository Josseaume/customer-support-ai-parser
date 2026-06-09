import { z } from "zod";
import { EmailExtractionSchema, type EmailExtraction } from "@/lib/schema";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b:free";
const MAX_ATTEMPTS = 3;

// JSON Schema derived from the Zod schema (single source of truth). Sent to the model
// as a structured-output constraint: strictly enforced on paid models, best-effort on
// the free tier — Zod (below) remains the actual guarantee.
const responseJsonSchema = z.toJSONSchema(EmailExtractionSchema) as Record<string, unknown>;
delete responseJsonSchema.$schema;

const SYSTEM_PROMPT = `You parse raw customer-support emails into structured data.
Return ONLY a JSON object with exactly these keys:
  - "order_id": the order reference if the email mentions one (e.g. "ORD-48271"), otherwise null. Never invent one.
  - "sentiment": one of "Positive", "Neutral", "Negative", or "None".
  - "urgency": one of "Low", "Medium", "High", or "None".
  - "processing_notes": one short sentence explaining your reasoning or flagging an issue.

Sentiment:
  - "Positive" / "Neutral" / "Negative": the customer's emotional tone when there is a real message.
  - "None": no real customer message to assess — pure noise, a test, an empty body, an auto-bounce, or a bare acknowledgement ("thanks", "received, ok") with nothing to act on.

Urgency (how fast a human must respond):
  - "High": time-sensitive problem — undelivered / damaged / wrong order, refund demand, deadline, or threat (chargeback, legal).
  - "Medium": a genuine request or question that needs a reply but is not time-critical (e.g. a return-policy question).
  - "Low": on-topic but casual, no pressing need (e.g. a vague "just checking in").
  - "None": nothing to respond to — noise, empty, auto-bounce, or positive feedback that needs no action.

Rules:
  - Foreign language: still extract, and mention the detected language in processing_notes.
  - Never invent an order_id; if absent use null even when the email is angry or urgent.
  - Output strictly valid JSON, no markdown, no extra text.`;

// A couple of few-shot examples — the free model otherwise under-uses "None". The order
// IDs here are synthetic (not from the test set) so fixtures never leak into the prompt.
const FEW_SHOT: ReadonlyArray<{ role: "user" | "assistant"; content: string }> = [
  { role: "user", content: "Subject: Hello\n\nHello, test." },
  {
    role: "assistant",
    content:
      '{"order_id":null,"sentiment":"None","urgency":"None","processing_notes":"Noise/test message with no actionable content."}',
  },
  { role: "user", content: "Subject: Re: Order #ORD-1001\n\nGot it, thanks — all good!" },
  {
    role: "assistant",
    content:
      '{"order_id":"ORD-1001","sentiment":"Positive","urgency":"None","processing_notes":"Positive acknowledgement, no action required."}',
  },
];

export interface ExtractOptions {
  model?: string;
  /** Optional abort signal to cancel the request. */
  signal?: AbortSignal;
}

/**
 * Extract structured metadata from one raw support email.
 *
 * The model output is validated against `EmailExtractionSchema`, so anything this
 * function returns is guaranteed to match the schema. The free endpoint occasionally
 * emits malformed JSON even with structured outputs, so it retries up to
 * `MAX_ATTEMPTS` times — the first attempt is deterministic (temperature 0) for
 * accuracy, retries add a small jitter so a one-off bad response isn't reproduced
 * identically. It throws only if every attempt fails — the caller turns that into a
 * single-row error, so one bad email never crashes a batch.
 */
export async function extractFromEmail(
  emailText: string,
  options: ExtractOptions = {},
): Promise<EmailExtraction> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing (set it in .env.local).");
  }

  const model = options.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Deterministic first try; jitter on retries to escape a reproducible bad roll.
    const temperature = attempt === 1 ? 0 : 0.4;
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        signal: options.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature,
          response_format: {
            type: "json_schema",
            json_schema: { name: "email_extraction", strict: true, schema: responseJsonSchema },
          },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...FEW_SHOT,
            { role: "user", content: emailText },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(
          `OpenRouter request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      const content: unknown = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error("OpenRouter response did not contain a text message.");
      }

      // Zod is the guarantee: whatever reaches the rest of the app has the exact
      // expected shape. A malformed or hallucinated payload throws here and we retry.
      return EmailExtractionSchema.parse(JSON.parse(stripJsonFences(content)));
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Could not extract valid data after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`,
  );
}

/** Defensive: some models wrap JSON in ```json fences. Strip them if present. */
function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
