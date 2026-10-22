/** JSON requests are independent of the React Server Component response stream. */
export async function postJson<T>(
  url: string,
  input: unknown,
  options: {
    timeoutMs: number;
    timeoutMessage: string;
    failureMessage: string;
  },
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(options.timeoutMessage));
    }, options.timeoutMs);
  });
  const request = async () => {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error(options.failureMessage);
    }
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        typeof result?.error === "string"
          ? result.error
          : options.failureMessage,
      );
    }
    return result as T;
  };
  try {
    return await Promise.race([request(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
