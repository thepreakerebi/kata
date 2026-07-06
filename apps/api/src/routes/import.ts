import { Hono } from "hono";
import { z } from "zod";
import { getOrCreateDemoMerchant } from "@/ingest/ingest";
import { importNotebookPhoto } from "@/memory/import-notebook";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const importSchema = z.object({
  imageBase64: z
    .string()
    .min(1)
    // ~4/3 base64 expansion over the byte cap.
    .max((MAX_IMAGE_BYTES * 4) / 3 + 4),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

/** Notebook-photo import from the dashboard. */
export const importRoutes = new Hono().post("/notebook", async (c) => {
  const parsed = importSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: "A JPEG, PNG, or WebP image under 8 MB is required" },
      400,
    );
  }

  const merchantId = await getOrCreateDemoMerchant();
  const result = await importNotebookPhoto({
    merchantId,
    imageBase64: parsed.data.imageBase64,
    mimeType: parsed.data.mimeType,
    channel: "simulator",
    chatJid: "sim:notebook",
    senderJid: "sim:merchant",
  });

  return c.json(result, 201);
});
