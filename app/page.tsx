"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type { ParseResult } from "@/app/api/parse/route";

type Pending = { id: string; filename: string; content: string };
type Status = "idle" | "loading" | "done" | "error";

/** Semantic status colors for sentiment / urgency pills. */
const TONE: Record<string, string> = {
  Positive: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Negative: "bg-red-50 text-red-700 ring-red-600/20",
  High: "bg-red-50 text-red-700 ring-red-600/20",
  Medium: "bg-amber-50 text-amber-700 ring-amber-600/20",
  Low: "bg-slate-100 text-slate-600 ring-slate-500/20",
  Neutral: "bg-slate-100 text-slate-600 ring-slate-500/20",
  Failed: "bg-red-50 text-red-700 ring-red-600/20",
};

function Pill({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[value] ?? TONE.Neutral}`}
    >
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

  const plural = pending.length > 1 ? "s" : "";

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 sm:py-16">
      {/* Brand bar */}
      <header className="flex items-center gap-2.5">
        <Image
          src="/volume-logo.png"
          alt="Volume 2"
          width={28}
          height={28}
          className="rounded-full"
          priority
        />
        <span className="text-sm font-semibold text-slate-900">Volume 2</span>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-500">Customer Support</span>
      </header>

      {/* Title */}
      <div className="mt-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Email Parser
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-500">
          Drop raw support emails — the model extracts order, sentiment and urgency, validated
          against a strict schema. Files are read in your browser; the API key stays server-side.
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`mt-8 cursor-pointer rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300"
        }`}
      >
        <svg
          className="mx-auto h-8 w-8 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 7.5 12 3m0 0L7.5 7.5M12 3v13.5"
          />
        </svg>
        <p className="mt-3 text-sm font-medium text-slate-900">Drag &amp; drop .eml files</p>
        <p className="mt-1 text-xs text-slate-500">or click to browse</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".eml,.txt,message/rfc822,text/plain"
          className="hidden"
          onChange={(e: ChangeEvent<HTMLInputElement>) => void addFiles(e.target.files)}
        />
      </div>

      {/* Pending + action */}
      {pending.length > 0 && status !== "done" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {pending.length} file{plural} ready
            <button onClick={reset} className="ml-3 text-slate-700 underline underline-offset-2 hover:text-slate-900">
              clear
            </button>
          </p>
          <button
            onClick={() => void parse()}
            disabled={status === "loading"}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {status === "loading" ? "Processing…" : `Parse ${pending.length} email${plural}`}
          </button>
        </div>
      )}

      {/* Error */}
      {status === "error" && error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-700">
              {results.length} result{results.length > 1 ? "s" : ""}
            </h2>
            <button onClick={reset} className="text-sm text-slate-500 transition-colors hover:text-slate-900">
              New batch
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Order ID</th>
                    <th className="px-4 py-3 font-medium">Sentiment</th>
                    <th className="px-4 py-3 font-medium">Urgency</th>
                    <th className="px-4 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((row) => (
                    <tr key={row.id} className="align-top transition-colors hover:bg-slate-50">
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate text-slate-800">{row.snippet || "—"}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{row.filename}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        {row.ok ? (
                          (row.data.order_id ?? <span className="text-slate-400">—</span>)
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.ok ? <Pill value={row.data.sentiment} /> : <Pill value="Failed" />}
                      </td>
                      <td className="px-4 py-3">
                        {row.ok ? <Pill value={row.data.urgency} /> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {row.ok ? row.data.processing_notes : <span className="text-red-600">{row.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
