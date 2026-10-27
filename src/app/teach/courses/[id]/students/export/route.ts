import { connection } from "next/server";

import { auth } from "@/lib/auth";
import { toCsvRow, UTF8_BOM } from "@/lib/csv";
import {
  iterateCourseStudents,
  loadRosterCourse,
  PROGRESS_CSV_HEADER,
  toProgressCsvCells,
} from "@/lib/students";

/**
 * Streaming progress export (P5.5).
 *
 * A route handler rather than a server action: the response is the download.
 * Students are read page by page through `iterateCourseStudents`, so the file
 * is produced with a flat memory profile and starts downloading immediately.
 * The BOM makes Excel open Chinese names as UTF-8 instead of mojibake.
 */

function csvResponse(body: BodyInit, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Auth.js draws random bytes; keep the handler out of the prerender pass.
  await connection();

  const { id } = await context.params;

  const session = await auth();
  const user = session?.user;

  if (user === undefined) {
    return new Response("Sign in to export progress.", { status: 401 });
  }

  if (user.role !== "INSTRUCTOR" && user.role !== "ADMIN") {
    return new Response("Forbidden.", { status: 403 });
  }

  const course = await loadRosterCourse(id);
  if (course === null || course.createdById !== user.id) {
    return new Response("Course not found.", { status: 404 });
  }

  const slug = course.slug.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(`${UTF8_BOM}${toCsvRow(PROGRESS_CSV_HEADER)}\r\n`),
        );

        for await (const student of iterateCourseStudents(course.id)) {
          controller.enqueue(
            encoder.encode(`${toCsvRow(toProgressCsvCells(student))}\r\n`),
          );
        }

        controller.close();
      } catch (error: unknown) {
        console.error("[students] progress export failed", error);
        controller.error(error);
      }
    },
  });

  return csvResponse(stream, `course-${slug}-progress.csv`);
}
