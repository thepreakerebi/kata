import { z } from "zod";

const envSchema = z.object({
  // Models come from the OpenAI API; AWS (EC2 runtime + S3 media) is the
  // deployment layer. AWS credentials resolve via the standard chain.
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  // Chat model must accept image input (paper-notebook OCR import).
  OPENAI_CHAT_MODEL: z.string().min(1).default("gpt-5.1"),
  // Embeddings are truncated to 1024 dims to match the VECTOR(1024) columns.
  OPENAI_EMBED_MODEL: z.string().min(1).default("text-embedding-3-small"),
  AWS_REGION: z.string().min(1).default("eu-west-1"),
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
