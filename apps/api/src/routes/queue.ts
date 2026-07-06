import { desc, and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "@/db/client";
import { memories, messages } from "@/db/schema";
import { getOrCreateDemoMerchant } from "@/ingest/ingest";
import {
  confirmCorrectionsSchema,
  confirmMemory,
  rejectMemory,
} from "@/memory/confirm";

const idSchema = z.uuid();

/** The merchant confirmation queue: facts held below the confidence gate. */
export const queueRoutes = new Hono()
  .get("/", async (c) => {
    const merchantId = await getOrCreateDemoMerchant();
    const pending = await db
      .select({
        id: memories.id,
        class: memories.class,
        content: memories.content,
        confidence: memories.confidence,
        structured: memories.structured,
        createdAt: memories.createdAt,
        sourceBody: messages.body,
        sourceChannel: messages.channel,
        sourceSentAt: messages.sentAt,
      })
      .from(memories)
      .innerJoin(messages, eq(memories.sourceMessageId, messages.id))
      .where(
        and(
          eq(memories.merchantId, merchantId),
          eq(memories.status, "pending"),
        ),
      )
      .orderBy(desc(memories.createdAt))
      .limit(100);
    return c.json({ pending });
  })
  .post("/:id/confirm", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid memory id" }, 400);

    const body = await c.req.json().catch(() => ({}));
    const corrections = confirmCorrectionsSchema.safeParse(body);
    if (!corrections.success) {
      return c.json({ error: "Corrections are not valid" }, 400);
    }

    const merchantId = await getOrCreateDemoMerchant();
    const hasCorrections =
      corrections.data.content !== undefined ||
      corrections.data.ledger !== undefined;
    const result = await confirmMemory({
      merchantId,
      memoryId: id.data,
      corrections: hasCorrections ? corrections.data : undefined,
    });

    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 409;
      return c.json(
        { error: result.error === "not_found" ? "Memory not found" : "Memory is not pending" },
        status,
      );
    }
    return c.json(result);
  })
  .post("/:id/reject", async (c) => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "Invalid memory id" }, 400);

    const merchantId = await getOrCreateDemoMerchant();
    const result = await rejectMemory({ merchantId, memoryId: id.data });
    if (!result.ok) {
      return c.json({ error: "Memory not found or not pending" }, 404);
    }
    return c.json(result);
  });
