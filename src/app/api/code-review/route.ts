import { JsonRequestError, readJsonPost } from "@/lib/json-request";
import { requestCodeReview } from "@/server/code-review";

const HEADERS = { "Cache-Control": "no-store" };
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonPost(request, 250_000);
    // The service validates every input field and repeats learner/teacher authorization.
    const result = await requestCodeReview(
      body as Parameters<typeof requestCodeReview>[0],
    );
    return Response.json(result, {
      status: result.ok ? 200 : 400,
      headers: HEADERS,
    });
  } catch (cause) {
    return Response.json(
      {
        ok: false,
        error:
          cause instanceof JsonRequestError
            ? cause.message
            : "Code review unavailable. Please retry.",
      },
      {
        status: cause instanceof JsonRequestError ? cause.status : 500,
        headers: HEADERS,
      },
    );
  }
}
