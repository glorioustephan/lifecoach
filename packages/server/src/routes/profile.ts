import { Hono } from "hono";
import { z } from "zod";
import type { Lifecoach } from "@lifecoach/core";

const setSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

export const profileRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  app.get("/", (c) => {
    return c.json({ profile: lc.memory.identity.entries() });
  });

  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = setSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
    lc.memory.identity.set(parsed.data.key, parsed.data.value);
    return c.json({ ok: true });
  });

  app.delete("/:key", (c) => {
    lc.memory.identity.unset(c.req.param("key"));
    return c.json({ ok: true });
  });

  return app;
};
