import { z } from "zod";


export const EmailExtractionSchema = z.object({
  order_id: z.string().nullable(),


  sentiment: z.enum(["Positive", "Neutral", "Negative"]),

  urgency: z.enum(["Low", "Medium", "High"]),

  processing_notes: z.string(),
});

export type EmailExtraction = z.infer<typeof EmailExtractionSchema>;
