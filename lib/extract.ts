import { EmailExtractionSchema, type EmailExtraction } from "@/lib/schema";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b:free";
const MAX_ATTEMPTS = 2;

/**
 * Instructions sent to the model. They cover every trap in the test dataset:
 * a missing order id, foreign languages, and empty / irrelevant ("noise") emails.
 */
const SYSTEM_PROMPT = `You parse raw customer-support emails into structured data.
Return ONLY a JSON object with exactly these keys:
  - "order_id": the order reference if the email mentions one (e.g. "ORD-48271"), otherwise null. Never invent one.
  - "sentiment": one of "Positive", "Neutral", "Negative".
  - "urgency": one of "Low", "Medium", "High", based on tone and time-sensitivity.
  - "processing_notes": one short sentence explaining your reasoning or flagging an issue.
Rules:
  - Foreign language: still extract, and mention the detected language in processing_notes.
  - Empty, irrelevant or test ("noise") email: use "Neutral" / "Low" and say so in processing_notes.
  - Output strictly valid JSON, no markdown, no extra text.`;

export interface ExtractOptions {
  /** Override the model (defaults to the OPENROUTER_MODEL env var, then the free model). */
  model?: string;
  /** Optional abort signal to cancel the request. */
  signal?: AbortSignal;
}

/**
 * Extract structured metadata from one raw support email.
 *
 * The model output is validated against `EmailExtractionSchema`, so anything
 * this function returns is guaranteed to match the schema. It retries once on a
 * bad response and throws if it still cannot get a valid result — the caller
 * decides how to handle that single email (so one bad email never crashes a batch).
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
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
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
