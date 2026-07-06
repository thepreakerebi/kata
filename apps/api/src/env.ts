import { z } from "zod";

const envSchema = z.object({
  // AWS credentials come from the standard chain (env vars locally, task role
  // on ECS) — only region and model IDs are validated here.
  AWS_REGION: z.string().min(1).default("us-east-1"),
  BEDROCK_CHAT_MODEL_ID: z
    .string()
    .min(1)
    .default("global.anthropic.claude-sonnet-4-5-20250929-v1:0"),
  BEDROCK_EMBED_MODEL_ID: z
    .string()
    .min(1)
    .default("amazon.titan-embed-text-v2:0"),
  // Empty until AWS is provisioned; media code asserts presence at use time.
  S3_BUCKET: z.string().default(""),
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
