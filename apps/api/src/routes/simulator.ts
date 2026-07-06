import { Hono } from "hono";
import { z } from "zod";
import { getOrCreateDemoMerchant, ingestMessage } from "@/ingest/ingest";

const sendSchema = z.object({
  body: z.string().min(1).max(4000),
  // Simulated sender ("customer" chat line); defaults to the demo chat.
  sender: z.string().min(1).max(100).default("sim-customer"),
});

/**
 * The dashboard simulator: a chat input that feeds the exact same ingest
 * pipeline as WhatsApp. Dev console and judge-access fallback.
 */
export const simulatorRoutes = new Hono().post("/message", async (c) => {
  const parsed = sendSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "A message body is required" }, 400);
  }

  const merchantId = await getOrCreateDemoMerchant();
  const result = await ingestMessage({
    merchantId,
    channel: "simulator",
    chatJid: "sim:default",
    senderJid: `sim:${parsed.data.sender}`,
    body: parsed.data.body,
    sentAt: new Date(),
  });

  return c.json(result, 201);
});
