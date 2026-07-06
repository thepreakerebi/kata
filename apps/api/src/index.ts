import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { env } from "./env";
import { startDecayLoop } from "./memory/decay";
import { startWhatsApp } from "./whatsapp/adapter";
import { requireAuth } from "./middleware/auth";
import { decayRoutes } from "./routes/decay";
import { memoryRoutes } from "./routes/memories";
import { queueRoutes } from "./routes/queue";
import { recallRoutes } from "./routes/recall";
import { simulatorRoutes } from "./routes/simulator";

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

app.use("/api/*", requireAuth);
app.route("/api/simulator", simulatorRoutes);
app.route("/api/recall", recallRoutes);
app.route("/api/queue", queueRoutes);
app.route("/api/decay", decayRoutes);
app.route("/api/memories", memoryRoutes);

startDecayLoop();
startWhatsApp().catch((error) => {
  console.error("whatsapp: failed to start:", (error as Error).message);
});

export default {
  port: env.PORT,
  fetch: app.fetch,
};
