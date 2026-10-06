import { createHmac, timingSafeEqual } from "node:crypto";

type SignedTokenPayload = {
  scope: "profile-session" | "profile-restore";
  profileId: string;
  expiresAt: number;
};

const TOKEN_PREFIX = "arise1";
const PROFILE_SESSION_SECONDS = 60 * 60 * 24 * 30;
const RESTORE_SESSION_SECONDS = 60 * 5;

function signingSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Profile authentication is unavailable.");
  }
  return secret;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", signingSecret()).update(encodedPayload).digest("base64url");
}

function createToken(scope: SignedTokenPayload["scope"], profileId: string, lifetimeSeconds: number): string {
  const payload: SignedTokenPayload = {
    scope,
    profileId,
    expiresAt: Math.floor(Date.now() / 1000) + lifetimeSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${TOKEN_PREFIX}.${encoded}.${sign(encoded)}`;
}

export function createProfileSessionToken(profileId: string): string {
  return createToken("profile-session", profileId, PROFILE_SESSION_SECONDS);
}

export function createRestoreCandidateToken(profileId: string): string {
  return createToken("profile-restore", profileId, RESTORE_SESSION_SECONDS);
}

export function verifyProfileToken(
  token: string,
  scope: SignedTokenPayload["scope"] = "profile-session",
): string | null {
  try {
    const [prefix, encoded, signature, extra] = token.split(".");
    if (prefix !== TOKEN_PREFIX || !encoded || !signature || extra !== undefined) return null;
    const expected = Buffer.from(sign(encoded), "base64url");
    const received = Buffer.from(signature, "base64url");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<SignedTokenPayload>;
    if (payload.scope !== scope
      || typeof payload.profileId !== "string"
      || !/^arise_[0-9a-f-]{36}$/i.test(payload.profileId)
      || !Number.isSafeInteger(payload.expiresAt)
      || (payload.expiresAt as number) <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload.profileId;
  } catch {
    return null;
  }
}

export function isProfileToken(token: string): boolean {
  return token.startsWith(`${TOKEN_PREFIX}.`);
}