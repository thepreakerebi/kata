import OpenAI from "openai";
import type { ZodType } from "zod";
import { env } from "@/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

/**
 * One structured-output chat call: the model must return JSON matching
 * `schema`. LLM output is untrusted input — it is always zod-parsed, never
 * used raw. Reasoning effort stays minimal: extraction calls are short and
 * high-volume.
 */
export async function completeJson<T>(options: {
  system: string;
  user: string;
  schema: ZodType<T>;
  model?: string;
}): Promise<T> {
  const response = await openai.chat.completions.create({
    model: options.model ?? env.OPENAI_CHAT_MODEL,
    reasoning_effort: "minimal",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) {
    throw new Error("LLM returned an empty response");
  }
  return options.schema.parse(JSON.parse(raw));
}

/** Embed one text at 1024 dimensions (matches the VECTOR(1024) columns). */
export async function embed(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: env.OPENAI_EMBED_MODEL,
    input: text,
    dimensions: 1024,
  });
  const vector = response.data[0]?.embedding;
  if (!vector) {
    throw new Error("Embedding response was empty");
  }
  return vector;
}

/** Embed many texts in one request, preserving order. */
export async function embedMany(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await openai.embeddings.create({
    model: env.OPENAI_EMBED_MODEL,
    input: texts,
    dimensions: 1024,
  });
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}
