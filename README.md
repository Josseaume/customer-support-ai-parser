# Customer Support AI Parser

Drop a batch of raw customer-support emails and get a clean dashboard of their key
metadata — **order ID, sentiment, urgency** — extracted by a language model and
validated end-to-end with a strict schema.

Built with Next.js + TypeScript. It handles the messy reality of a real inbox:
missing order IDs, foreign languages, empty / noise emails, and MIME encoding.

## Getting started

```bash
npm install
cp .env.example .env.local      # then add your OpenRouter key
npm run dev                     # http://localhost:3000
```

Then drag & drop raw `.eml` files onto the dashboard (samples in `files/`).

| Env variable | Required | Default |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | yes | — ([create a key](https://openrouter.ai/keys)) |
| `OPENROUTER_MODEL` | no | `openai/gpt-oss-120b:free` |

The key is read server-side only; it never reaches the browser.

## How it works

```
.eml files ─▶ browser reads text ─▶ POST /api/parse
                                          │
                        MIME decode (postal-mime)
                                          │
                  LLM extract (OpenRouter) ─▶ Zod validate ─▶ dashboard
```

- **`lib/schema.ts`** — the Zod schema: single source of truth, and it generates the TypeScript type.
- **`lib/parseEmail.ts`** — decodes the raw `.eml` (quoted-printable, base64 subjects, charsets) into a clean `{ from, subject, body }`.
- **`lib/extract.ts`** — calls the model with `response_format: json_object`, validates the output against the schema, retries once.
- **`app/api/parse/route.ts`** — batches emails; each one is isolated, so a single failure is a row error, never a crash.
- **`app/page.tsx`** — the drag-and-drop dashboard.

## Stack & decisions

> ⚠️ **These are deliberately pragmatic, _standard_ choices for a working v1 — a
> baseline to get the whole flow correct, not final answers.** See **Working method**.

| Choice | Why (for now) |
| --- | --- |
| **Next.js 15 + TypeScript (strict)** | Front + API in one project; the API route keeps the model key server-side. Pinned to **15** because 16.2.7 has a build regression on the internal error pages. |
| **OpenRouter — `gpt-oss-120b:free`** | Free for dev/test behind a provider-agnostic interface; flip one identifier (`OPENROUTER_MODEL`) to a paid model for production. Synthetic test data in dev, a zero-retention paid endpoint for real PII. |
| **Plain `fetch` + Zod** (no AI SDK) | Transparent, dependency-light, and reliable with free models. `json_object` mode + `schema.parse()` + one retry guarantees the output shape. |
| **postal-mime** | The test emails are MIME-encoded; decode before sending to the model so it gets real text, not `=C3=A9` noise. |

## Model & privacy strategy

The model is a one-line swap (`OPENROUTER_MODEL`) behind a provider-agnostic interface, so
the choice is driven by the privacy / accuracy / cost trade-off rather than locked in:

| Context | Model | Privacy | Notes |
| --- | --- | --- | --- |
| **Demo / dev (current)** | `gpt-oss-120b:free` | synthetic data only | Free and fully multilingual (verified on FR, ES, HE, ZH, RU). The free endpoint has **no zero-retention guarantee** — never send real PII. |
| **Production, no infra** | a paid **zero-data-retention** endpoint on OpenRouter | contractual ZDR | One-line change; also removes the free tier's occasional malformed JSON and rate limits. |
| **Maximum confidentiality** _(with more time)_ | a smaller open model run **locally** (larger machine / GPU) | data never leaves the perimeter | No third-party dependency at all. Trade-off: lower raw accuracy than a frontier model, plus hosting / ops cost. |

**Reliability note:** the _free_ endpoint occasionally returns malformed JSON **even with
structured outputs** (observed ~1 in 10). It is absorbed by Zod validation + a
temperature-jittered retry, so the user never sees it — and it essentially disappears on a
paid model that enforces structured outputs.

## Resilience — the traps

Every email is processed independently and validated by Zod, so the dashboard never
crashes on a bad email:

| Trap | Handling |
| --- | --- |
| Missing order ID | `order_id: null` (schema + prompt; never invented) |
| Foreign language | decoded by MIME, language noted by the model |
| Empty / noise email | `Neutral` / `Low` + flagged; blank snippet, never raw headers |
| MIME encoding | decoded by postal-mime |
| Malformed model output | Zod validation + one retry, otherwise a clean per-row error |

## Scope & trade-offs

Scope vs. the few-day timeline was in tension, so I scoped **deliberately**:

- **Built:** the full pipeline (schema → decode → extract → API → dashboard), every
  trap above, MIME decoding, and a clean branch-per-feature + PR history.
- **Simplified / deferred on purpose:**
  - **Sequential** email processing — kinder to the free tier's rate limit; bounded concurrency would come with real volume.
  - **Free model** for now — a paid, privacy-reviewed endpoint is the production path
    (see **Model & privacy strategy**).
  - **Local model** — running a smaller open model on a larger machine (no third-party
    dependency, strongest privacy) is the "with more time" direction.
  - **No persistence, no auth** — out of scope for the timeline.
  - **Mailbox integration** (reading a real inbox) — the "with more time" feature, left out.

## Working method

I build in two passes. **First, a working app with standard, pragmatic choices** — get
the whole flow correct end-to-end. **Then a second pass to deepen each choice**: model
selection, concurrency, privacy / GDPR, prompt tuning, and tests. Everything above is the
first pass — documented here so the reasoning is explicit, and meant to be revisited and
justified more deeply, not treated as final.
