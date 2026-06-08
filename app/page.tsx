"use client";

import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type { ParseResult } from "@/app/api/parse/route";

type Pending = { id: string; filename: string; content: string };
type Status = "idle" | "loading" | "done" | "error";

/** Map a sentiment/urgency value to a restrained, on-brand tone color. */
function toneClass(value: string): string {
  if (value === "Positive" || value === "Low") return "text-gold";
  if (value === "Negative" || value === "High") return "text-brick";
  return "text-muted";
}

function Tag({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] ${toneClass(value)}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value}
    </span>
  );
}

export default function Home() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [results, setResults] = useState<ParseResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const items = await Promise.all(
      Array.from(fileList).map(async (file, i) => ({
        id: `${Date.now()}-${i}-${file.name}`,
        filename: file.name,
        content: await file.text(),
      })),
    );
    setPending((prev) => [...prev, ...items]);
    setResults([]);
    setStatus("idle");
    setError(null);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      void addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const parse = useCallback(async () => {
    if (pending.length === 0) return;
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: pending }),
      });
      if (!res.ok) throw new Error(`The server responded with ${res.status}.`);
      const data = (await res.json()) as { results: ParseResult[] };
      setResults(data.results);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }, [pending]);

  const reset = useCallback(() => {
    setPending([]);
    setResults([]);
    setStatus("idle");
    setError(null);
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-20 sm:px-10 sm:py-28">
      <header className="mb-14">
        <p className="overline">Volume 2 — Customer Support</p>
        <h1 className="mt-6 font-display text-5xl leading-none tracking-tight text-ink sm:text-7xl">
          Email Parser
        </h1>
        <p className="mt-5 max-w-xl font-serif text-xl leading-relaxed text-ink/70">
          Drop a batch of raw support emails. Each one is read by a model and distilled into
          order, sentiment and urgency — validated, never hallucinated.
        </p>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer border px-8 py-16 text-center transition-colors ${
          dragging ? "border-gold bg-ivory-soft" : "border-hair bg-ivory-soft/40 hover:border-gold/60"
        }`}
      >
        <p className="overline justify-center">Drop emails</p>
        <p className="mt-5 font-serif text-2xl text-ink">Drag &amp; drop your .eml files here</p>
        <p className="mt-2 text-sm text-muted">
          or click to browse — files are read in your browser, the API key stays server-side
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".eml,.txt,message/rfc822,text/plain"
          className="hidden"
          onChange={(e: ChangeEvent<HTMLInputElement>) => void addFiles(e.target.files)}
        />
      </div>

      {pending.length > 0 && status !== "done" && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-hair pt-6">
          <p className="text-sm text-muted">
            {pending.length} email{pending.length > 1 ? "s" : ""} ready
            <button onClick={reset} className="ml-4 text-gold underline-offset-4 hover:underline">
              clear
            </button>
          </p>
          <button
            onClick={() => void parse()}
            disabled={status === "loading"}
            className="bg-taupe px-8 py-4 text-xs uppercase tracking-[0.22em] text-ivory transition-colors hover:bg-ink disabled:opacity-60"
          >
            {status === "loading"
              ? "Processing…"
              : `Parse ${pending.length} email${pending.length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {status === "error" && error && (
        <p className="mt-8 border-l-2 border-brick pl-4 text-sm text-brick">{error}</p>
      )}

      {results.length > 0 && (
        <section className="mt-16">
          <div className="mb-6 flex items-center justify-between">
            <p className="overline">Results — {results.length}</p>
            <button
              onClick={reset}
              className="text-xs uppercase tracking-[0.22em] text-muted transition-colors hover:text-ink"
            >
              New batch
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink/80 text-[10px] uppercase tracking-[0.2em] text-muted">
                  <th className="py-4 pr-6 font-normal">Email</th>
                  <th className="py-4 pr-6 font-normal">Order ID</th>
                  <th className="py-4 pr-6 font-normal">Sentiment</th>
                  <th className="py-4 pr-6 font-normal">Urgency</th>
                  <th className="py-4 font-normal">Notes</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.id} className="border-b border-hair align-top">
                    <td className="max-w-sm py-5 pr-6">
                      <p className="truncate text-sm text-ink">{row.snippet || "—"}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted">
                        {row.filename}
                      </p>
                    </td>
                    <td className="py-5 pr-6 text-sm text-ink">
                      {row.ok ? (
                        row.data.order_id ?? <span className="text-muted">—</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-5 pr-6">
                      {row.ok ? (
                        <Tag value={row.data.sentiment} />
                      ) : (
                        <span className="text-[11px] uppercase tracking-[0.18em] text-brick">Failed</span>
                      )}
                    </td>
                    <td className="py-5 pr-6">
                      {row.ok ? <Tag value={row.data.urgency} /> : <span className="text-muted">—</span>}
                    </td>
                    <td className="py-5 font-serif text-sm leading-relaxed text-ink/70">
                      {row.ok ? row.data.processing_notes : <span className="text-brick">{row.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
