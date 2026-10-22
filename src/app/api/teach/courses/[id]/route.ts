import { JsonRequestError, readJsonPost } from "@/lib/json-request";
import { saveCourse } from "@/server/editor";

const HEADERS = { "Cache-Control": "no-store" };
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const body = await readJsonPost(request, 2 * 1024 * 1024);
    const { id } = await context.params;
    // saveCourse validates the snapshot and checks the signed-in course owner.
    const result = await saveCourse(
      id,
      body as Parameters<typeof saveCourse>[1],
    );
    return Response.json(result, {
      status: result.ok ? 200 : 400,
      headers: HEADERS,
    });
  } catch (cause) {
    if (!(cause instanceof JsonRequestError))
      console.error("[editor] JSON save request failed", cause);
    return Response.json(
      {
        ok: false,
        error:
          cause instanceof JsonRequestError
            ? cause.message
            : "The course could not be saved. Keep this page open and retry.",
      },
      {
        status: cause instanceof JsonRequestError ? cause.status : 500,
        headers: HEADERS,
      },
    );
  }
}
