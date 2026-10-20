/** Browser POST endpoints keep the same origin protection as Server Actions. */
export class JsonRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function readJsonPost(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const origin = request.headers.get("origin");
  const hosts = new Set([new URL(request.url).host]);
  if (process.env.CODESPACE_NAME) {
    hosts.add(
      `${process.env.CODESPACE_NAME}-3000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? "app.github.dev"}`,
    );
    hosts.add("localhost:3000");
  }
  let allowed = false;
  if (origin) {
    try {
      const parsed = new URL(origin);
      allowed =
        ["http:", "https:"].includes(parsed.protocol) && hosts.has(parsed.host);
    } catch {
      /* Reject a malformed origin. */
    }
  }
  if (!allowed)
    throw new JsonRequestError(
      "Request origin is not allowed. Reopen the current site and retry.",
      403,
    );
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    throw new JsonRequestError("Expected a JSON request.", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new JsonRequestError("Request body is missing.", 400);
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new JsonRequestError("Request is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new JsonRequestError("Request contains invalid JSON.", 400);
  }
}
