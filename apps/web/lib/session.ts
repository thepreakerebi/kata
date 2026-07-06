const encoder = new TextEncoder();

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );
  return Buffer.from(signature).toString("base64url");
}

export const SESSION_COOKIE = "kata_session";

/** Mint a signed session token: payload.signature (Web Crypto, proxy-safe). */
export async function createSessionToken(secret: string): Promise<string> {
  const payload = `kata.${Date.now()}`;
  const signature = await hmac(payload, secret);
  return `${payload}.${signature}`;
}

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

/** Verify a session token's signature and age. */
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [prefix, issuedAt, signature] = parts as [string, string, string];
  const payload = `${prefix}.${issuedAt}`;
  const expected = await hmac(payload, secret);
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return false;
  const age = Date.now() - Number(issuedAt);
  return Number.isFinite(age) && age >= 0 && age < SESSION_MAX_AGE_MS;
}
