import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_PREFIXES = ["simulator", "recall", "queue", "decay", "memories"];

/**
 * Authenticated browser calls land here (the proxy gate already verified the
 * session cookie) and are forwarded to the Kata API with the server-held
 * bearer token. The token never reaches the client.
 */
async function forward(request: NextRequest, path: string[]) {
  if (!ALLOWED_PREFIXES.includes(path[0] ?? "")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const base = process.env.KATA_API_URL ?? "http://localhost:8787";
  const body = request.method === "GET" ? undefined : await request.text();
  const response = await fetch(`${base}/api/${path.join("/")}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${process.env.KATA_API_TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
    cache: "no-store",
  });

  const payload = await response.text();
  return new NextResponse(payload, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, path);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return forward(request, path);
}
