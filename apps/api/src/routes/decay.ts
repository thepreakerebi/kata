import { Hono } from "hono";
import { runDecay } from "@/memory/decay";

/** Manual decay trigger — dev console and demo ("watch memories fade"). */
export const decayRoutes = new Hono().post("/run", async (c) => {
  const report = await runDecay();
  return c.json({ report });
});
