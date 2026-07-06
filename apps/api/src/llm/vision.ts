import OpenAI from "openai";
import type { ZodType } from "zod";
import { env } from "@/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

/**
 * One vision call: an image plus instructions, JSON out, zod-parsed.
 * Used by the notebook import; the chat pipeline stays text-only.
 */
export async function completeVisionJson<T>(options: {
  system: string;
  user: string;
  imageBase64: string;
  mimeType: string;
  schema: ZodType<T>;
  model?: string;
}): Promise<T> {
  const response = await openai.chat.completions.create({
    model: options.model ?? env.OPENAI_CHAT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: options.system },
      {
        role: "user",
        content: [
          { type: "text", text: options.user },
          {
            type: "image_url",
            image_url: {
              url: `data:${options.mimeType};base64,${options.imageBase64}`,
            },
          },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message.content;
  if (!raw) {
    throw new Error("Vision model returned an empty response");
  }
  return options.schema.parse(JSON.parse(raw));
}
