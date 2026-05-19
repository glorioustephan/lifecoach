import type { MiddlewareHandler } from "hono";

/**
 * Auth middleware. Phase 2.A ships an open-but-trusted server: Tailscale is
 * the privacy boundary (only my devices can reach it). Phase 2.B will replace
 * this with Google OAuth via arctic + httpOnly session cookie + email
 * allow-list — the seam is here so the route definitions don't change.
 */
export interface AuthConfig {
  /** Comma-separated allow-list of email addresses (read from env). */
  allowedEmails: string[];
  /** When true, skip auth entirely (dev / Tailscale-private mode). */
  permissive: boolean;
}

export const loadAuthConfig = (): AuthConfig => {
  const raw = process.env["LIFECOACH_ALLOWED_EMAILS"] ?? "";
  const allowedEmails = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // Default to permissive when no allow-list is configured. Tailscale's
  // private mesh is the primary security boundary until OAuth lands.
  const permissive = allowedEmails.length === 0 || process.env["LIFECOACH_AUTH"] === "off";
  return { allowedEmails, permissive };
};

export const requireAuth = (config: AuthConfig): MiddlewareHandler => async (c, next) => {
  if (config.permissive) {
    await next();
    return;
  }
  // Placeholder: a real session check goes here in Phase 2.B.
  const cookieEmail = c.req.header("x-lifecoach-email")?.toLowerCase();
  if (cookieEmail && config.allowedEmails.includes(cookieEmail)) {
    await next();
    return;
  }
  return c.json({ error: "unauthorized" }, 401);
};
