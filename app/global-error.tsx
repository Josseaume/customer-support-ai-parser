"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        }}
      >
        <main style={{ textAlign: "center", padding: "2rem" }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "#64748b",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Error
          </p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0.75rem 0 1.25rem" }}>
            Something went wrong
          </h2>
          <button
            onClick={() => reset()}
            style={{
              background: "#0f172a",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "0.6rem 1.25rem",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
