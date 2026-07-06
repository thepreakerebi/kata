import { createMiddleware } from "hono/factory";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Interim bearer auth for write endpoints until dashboard session auth
 * lands: the token is the SESSION_SECRET, supplied server-side or via
 * curl during development. Judges receive demo credentials with the real
 * session auth. Comparison is constant-time.
 */
export const requireAuth = createMiddleware(async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = Buffer.from(env.SESSION_SECRET);
  const received = Buffer.from(token);
  const valid =
    received.length === expected.length &&
    timingSafeEqual(received, expected);
  if (!valid) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});
