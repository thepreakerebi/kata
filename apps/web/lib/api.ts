import "server-only";

/**
 * Server-side client for the Kata API. The bearer token never leaves the
 * server: RSCs call this directly, client components go through the
 * /api/kata proxy route which also uses it.
 */
export async function kataFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const base = process.env.KATA_API_URL ?? "http://localhost:8787";
  const response = await fetch(`${base}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${process.env.KATA_API_TOKEN}`,
      ...(init?.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Kata API ${path} responded ${response.status}`);
  }
  return response.json() as Promise<T>;
}
