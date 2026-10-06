import { getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import { isProfileToken, verifyProfileToken } from "../lib/profile-auth";

export type AuthenticatedRequest = Request & {
  verifiedClerkUserId: string;
  verifiedOwnerId: string;
};

export const requireAuth: RequestHandler = (req, res, next): void => {
  let userId: string | null = null;
  const authorization = req.header("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (isProfileToken(bearer)) {
    userId = verifyProfileToken(bearer);
    if (!userId) {
      res.status(401).json({ error: "A valid ARISE profile session is required." });
      return;
    }
  }
  try {
    // Clerk remains available for legacy account data; the ARISE app no longer starts Google auth.
    if (!userId) userId = getAuth(req).userId;
  } catch {
    if (!userId) userId = null;
  }

  if (!userId) {
    res.status(401).json({ error: "A valid signed-in account is required." });
    return;
  }

  (req as AuthenticatedRequest).verifiedClerkUserId = userId;
  (req as AuthenticatedRequest).verifiedOwnerId = userId;
  next();
};