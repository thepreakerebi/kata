import { Hono } from "hono";
import { z } from "zod";
import { getOrCreateDemoMerchant } from "@/ingest/ingest";
import { recall } from "@/memory/recall";

const askSchema = z.object({
  question: z.string().min(1).max(1000),
  tokenBudget: z.number().int().min(100).max(4000).optional(),
});

/** Ask the memory a question; returns the answer plus the full trace. */
export const recallRoutes = new Hono().post("/ask", async (c) => {
  const parsed = askSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "A question is required" }, 400);
  }

  const merchantId = await getOrCreateDemoMerchant();
  const result = await recall({
    merchantId,
    question: parsed.data.question,
    tokenBudget: parsed.data.tokenBudget,
  });

  return c.json(result);
});
