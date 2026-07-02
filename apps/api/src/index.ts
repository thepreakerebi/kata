import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { env } from "./env";

const app = new Hono();

app.use(secureHeaders());
app.use(logger());
app.use(
  "/api/*",
  cors({
    origin: env.CORS_ORIGINS,
    allowMethods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
  }),
);
app.use(
  bodyLimit({
    maxSize: 1024 * 1024, // 1 MB — chat payloads and confirmations only
    onError: (c) => c.json({ error: "Request body too large" }, 413),
  }),
);

app.get("/health", (c) =>
  c.json({ status: "ok", service: "kata-api", uptime: process.uptime() }),
);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
