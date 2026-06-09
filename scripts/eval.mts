// Eval harness — replays the .eml fixtures against the live /api/parse and checks
// the extracted metadata against expected values. Turns "it worked on my screen"
// into a reproducible pass/fail report.
//
// Run the app first (npm run dev), then: npm run eval
// (No API key needed here — the key stays server-side in the app.)

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const API = process.env.EVAL_API ?? "http://localhost:3000/api/parse";
const DIR = join(process.cwd(), "files", "files");

// Acceptable-set ground truth.
//   - order_id is objective → exact match, HARD assertion.
//   - sentiment/urgency list the ideal value first, then tolerated alternatives. The
//     Low/Medium/None boundary is a judgment call no LLM hits 100% deterministically,
//     so a value *inside* the set passes (a non-ideal-but-inside value is a warning),
//     and a value *outside* the set is a hard fail. See README "Resilience".
type Expected = { order_id: string | null; sentiment: string[]; urgency: string[] };

const EXPECTED: Record<string, Expected> = {
  "01_standard.eml": { order_id: "ORD-48271", sentiment: ["Negative"], urgency: ["High"] },
  "02_missing_order_id.eml": { order_id: null, sentiment: ["Negative"], urgency: ["High"] },
  "03_french.eml": { order_id: "ORD-91043", sentiment: ["Negative"], urgency: ["High", "Medium"] },
  "04_noise_irrelevant.eml": { order_id: null, sentiment: ["None", "Neutral"], urgency: ["None", "Low"] },
  "05_positive.eml": { order_id: "ORD-30085", sentiment: ["Positive"], urgency: ["None", "Low"] },
  "06_spanish.eml": { order_id: "ORD-77412", sentiment: ["Negative"], urgency: ["High"] },
  "07_neutral_no_order.eml": { order_id: null, sentiment: ["Neutral"], urgency: ["Medium", "Low"] },
  "08_empty_body.eml": { order_id: null, sentiment: ["None", "Neutral"], urgency: ["None", "Low"] },
  "09_urgent_wrong_item.eml": { order_id: "ORD-55930", sentiment: ["Negative"], urgency: ["High"] },
  "10_ambiguous.eml": { order_id: null, sentiment: ["Neutral", "None"], urgency: ["Low", "None"] },
  "11_hebrew.eml": { order_id: "ORD-63817", sentiment: ["Negative"], urgency: ["High", "Medium"] },
  "12_mandarin.eml": { order_id: "ORD-29504", sentiment: ["Negative"], urgency: ["High"] },
  "13_russian.eml": { order_id: "ORD-41290", sentiment: ["Negative"], urgency: ["High", "Medium"] },
};

type Extraction = { order_id: string | null; sentiment: string; urgency: string };
type Row = { filename: string; ok: boolean; data?: Extraction; error?: string };

const pad = (s: string, n: number) => s.padEnd(n);

const files = readdirSync(DIR).filter((f) => f.endsWith(".eml")).sort();
const emails = files.map((f, i) => ({
  id: String(i),
  filename: f,
  content: readFileSync(join(DIR, f), "utf8"),
}));

let res: Response;
try {
  res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emails }),
  });
} catch {
  console.error(`✗ Could not reach ${API} — start the app first:  npm run dev`);
  process.exit(1);
}
if (!res.ok) {
  console.error(`✗ ${API} responded ${res.status} ${res.statusText}`);
  process.exit(1);
}

const { results } = (await res.json()) as { results: Row[] };

let hardFails = 0;
let warns = 0;
console.log(`\nEval — ${results.length} fixtures vs ${API}\n`);

for (const r of results) {
  const exp = EXPECTED[r.filename];
  if (!exp) {
    console.log(`?  ${r.filename} — no expectation defined`);
    continue;
  }
  if (!r.ok || !r.data) {
    hardFails++;
    console.log(`✗  ${pad(r.filename, 26)} extraction FAILED — ${r.error ?? "no data"}`);
    continue;
  }
  const d = r.data;
  const idOk = d.order_id === exp.order_id;
  const sIn = exp.sentiment.includes(d.sentiment);
  const uIn = exp.urgency.includes(d.urgency);
  const hard = idOk && sIn && uIn;
  const nonIdeal = hard && (d.sentiment !== exp.sentiment[0] || d.urgency !== exp.urgency[0]);

  if (!hard) hardFails++;
  else if (nonIdeal) warns++;

  const mark = !hard ? "✗" : nonIdeal ? "~" : "✓";
  const idCell = idOk ? `id=${String(d.order_id)}` : `id=${String(d.order_id)}≠${String(exp.order_id)}`;
  const note = !hard
    ? "  <- OUT OF RANGE"
    : nonIdeal
      ? `  (non-ideal, accepted; ideal ${exp.sentiment[0]}/${exp.urgency[0]})`
      : "";
  console.log(`${mark}  ${pad(r.filename, 26)} ${pad(idCell, 24)} ${pad(d.sentiment, 9)} ${pad(d.urgency, 7)}${note}`);
}

const passed = results.length - hardFails;
console.log(
  `\n${passed}/${results.length} pass` +
    (hardFails ? ` · ${hardFails} FAIL` : "") +
    (warns ? ` · ${warns} non-ideal (warning)` : "") +
    "\n",
);
process.exit(hardFails ? 1 : 0);
