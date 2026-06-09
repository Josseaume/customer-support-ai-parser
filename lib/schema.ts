import { z } from "zod";


export const EmailExtractionSchema = z.object({
  order_id: z.string().nullable(),

  // "None" = no real message to assess (noise, empty, auto-bounce, bare "thanks").
  sentiment: z.enum(["Positive", "Neutral", "Negative", "None"]),

  // "None" = nothing to respond to (noise/empty, or positive feedback needing no action).
  urgency: z.enum(["Low", "Medium", "High", "None"]),

  processing_notes: z.string(),
});

export type EmailExtraction = z.infer<typeof EmailExtractionSchema>;
