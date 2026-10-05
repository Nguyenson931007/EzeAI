import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loadRootEnv() {
  const rootEnvPath = path.resolve(process.cwd(), "..", ".env");
  if (!fs.existsSync(rootEnvPath)) return;

  const content = fs.readFileSync(rootEnvPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function backendUrl() {
  loadRootEnv();
  const base = String(process.env.BACKEND_URL || "").trim().replace(/\/$/, "");
  if (!base) throw new Error("BACKEND_URL is not configured in the repository root .env");
  return `${base}/api/door-segment`;
}

function forwardHeaders(request) {
  const headers = new Headers();
  const allowed = [
    "content-type",
    "content-length",
    "cookie",
    "x-username",
    "x-session-token",
    "x-work-pack-unit",
  ];
  for (const name of allowed) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function POST(request) {
  const requestId = crypto.randomUUID();
  try {
    const upstream = await fetch(backendUrl(), {
      method: "POST",
      headers: forwardHeaders(request),
      body: request.body,
      // Required by Node fetch when forwarding a ReadableStream body.
      duplex: "half",
      cache: "no-store",
      signal: request.signal,
    });

    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    responseHeaders.set("x-ezefloor-request-id", requestId);

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    if (request.signal.aborted || error?.name === "AbortError") {
      return new Response(null, { status: 499 });
    }

    console.error(`[Door Seg Proxy][${requestId}] upstream request failed`, error);
    return Response.json(
      {
        detail: "Door segmentation backend connection failed.",
        request_id: requestId,
        error: error instanceof Error ? error.message : String(error),
      },
      {
        status: 502,
        headers: { "x-ezefloor-request-id": requestId },
      }
    );
  }
}
