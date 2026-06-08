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
          background: "#f5f1ea",
          color: "#0a0a0a",
          fontFamily: "Georgia, serif",
        }}
      >
        <main style={{ textAlign: "center", padding: "2rem" }}>
          <p
            style={{
              fontSize: 10,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "#8b6f47",
              margin: 0,
            }}
          >
            Error
          </p>
          <h2 style={{ fontSize: "2rem", fontWeight: 300, margin: "1rem 0 1.5rem" }}>
            Something went wrong
          </h2>
          <button
            onClick={() => reset()}
            style={{
              background: "#2a2724",
              color: "#f5f1ea",
              border: 0,
              padding: "0.9rem 2rem",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              fontSize: 12,
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
