import { z } from "zod";

const envSchema = z.object({
  DASHSCOPE_API_KEY: z.string().min(1, "DASHSCOPE_API_KEY is required"),
  QWEN_BASE_URL: z
    .string()
    .url()
    .default("https://dashscope-intl.aliyuncs.com/compatible-mode/v1"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim())),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 chars"),
  WA_AUTH_DIR: z.string().default("./auth-state"),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(Bun.env);
