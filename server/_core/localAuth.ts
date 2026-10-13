import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import type { User } from "../../drizzle/schema";

export const LOCAL_DEV_USER: User = {
  id: 1,
  openId: "local_dev_admin",
  name: "Administrator",
  email: "admin@soloflow.local",
  googleSubject: null,
  loginMethod: "local_auth",
  role: "admin",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  lastSignedIn: new Date(),
};

const DEV_CREDENTIALS = {
  username: "admin@soloflow.local",
  password: "admin123",
};

export function registerLocalAuthRoutes(app: Express) {
  // Local login endpoint: accepts username/email and password
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { username, password } = req.body ?? {};

    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    if (
      (cleanUsername === DEV_CREDENTIALS.username || cleanUsername === "admin") &&
      cleanPassword === DEV_CREDENTIALS.password
    ) {
      try {
        const sessionToken = await sdk.createSessionToken(LOCAL_DEV_USER.openId, {
          name: LOCAL_DEV_USER.name || "Administrator",
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        res.json({
          success: true,
          token: sessionToken,
          user: LOCAL_DEV_USER,
        });
      } catch (err) {
        console.error("[LocalAuth] Error minting session:", err);
        res.status(500).json({ error: "Failed to create session" });
      }
    } else {
      res.status(401).json({ error: "Invalid username or password" });
    }
  });

  // Local logout endpoint
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });
}
