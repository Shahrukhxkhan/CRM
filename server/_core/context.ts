import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { LOCAL_DEV_USER } from "./localAuth";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // If regular authentication fails, check for local dev token
    try {
      const parsedCookies = parseCookieHeader(opts.req.headers.cookie ?? "");
      const sessionToken =
        parsedCookies[COOKIE_NAME] ||
        (typeof opts.req.headers.authorization === "string" && opts.req.headers.authorization.startsWith("Bearer ")
          ? opts.req.headers.authorization.slice(7)
          : null);

      if (sessionToken) {
        const verified = await sdk.verifySession(sessionToken);
        if (verified && (verified.openId === LOCAL_DEV_USER.openId || !process.env.DATABASE_URL)) {
          user = {
            ...LOCAL_DEV_USER,
            name: verified.name || LOCAL_DEV_USER.name,
            openId: verified.openId,
          };
        }
      }
    } catch {
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
