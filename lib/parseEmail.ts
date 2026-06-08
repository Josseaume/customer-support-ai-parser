import PostalMime from "postal-mime";

export type ParsedEmail = {
  /** Sender decoded from the From header (name may be empty). */
  from: { name: string; address: string } | null;
  /** Decoded, human-readable subject (RFC 2047 encoded-words resolved). */
  subject: string;
  /** Decoded plain-text body (quoted-printable / base64 / charset resolved). */
  body: string;
};

/**
 * Parse a raw .eml string into clean, decoded fields. postal-mime handles the
 * MIME traps in the dataset — quoted-printable bodies, base64 / encoded-word
 * subjects, and non-Latin charsets — so the model receives real text instead of
 * `=C3=A9`-style noise, and the UI can show the sender rather than raw headers.
 */
export async function parseEmail(raw: string): Promise<ParsedEmail> {
  const email = await PostalMime.parse(raw);
  const address = email.from?.address;
  return {
    from: address ? { name: email.from?.name ?? "", address } : null,
    subject: email.subject?.trim() ?? "",
    body: (email.text ?? "").trim(),
  };
}
