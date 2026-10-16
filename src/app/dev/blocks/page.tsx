import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { BlockRenderer } from "@/components/blocks/BlockRenderer";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { blockListSchema } from "@/lib/blocks/schema";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Block playground",
};

/**
 * Temporary playground for the block engine (P2.1 / P2.2 acceptance): it renders
 * every block of the seeded placeholder lesson outside the real player, so the
 * rendering, completion and scoring paths can be clicked through. To be removed
 * once the lesson player (P2.5) renders the same blocks.
 */
const PLACEHOLDER_SLUG = "getting-started-with-genai-for-developers";

function readCompletedBlocks(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

async function BlockPlaygroundContent() {
  // Prisma reads must not run during the prerender pass.
  await connection();
  const session = await auth();

  const lesson = await prisma.lesson.findFirst({
    where: { module: { course: { slug: PLACEHOLDER_SLUG } } },
    orderBy: [{ module: { order: "asc" } }, { order: "asc" }],
    select: {
      id: true,
      title: true,
      blocks: true,
      module: { select: { courseId: true, course: { select: { title: true } } } },
      progress: {
        where: { userId: session?.user?.id ?? "" },
        select: { completedBlocks: true, score: true, status: true },
      },
    },
  });

  if (lesson === null) {
    return (
      <p className="text-sm text-muted-foreground">
        No seeded lesson found. Run <code>npm run db:seed</code> first.
      </p>
    );
  }

  const parsed = blockListSchema.safeParse(lesson.blocks);
  if (!parsed.success) {
    return (
      <div>
        <p className="text-sm text-red-600">
          The stored blocks do not match the schema.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
          {JSON.stringify(parsed.error.issues, null, 2)}
        </pre>
      </div>
    );
  }

  const progress = lesson.progress[0];
  const completedBlocks = readCompletedBlocks(progress?.completedBlocks);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{lesson.module.course.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {lesson.title} · {parsed.data.length} blocks
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {session?.user === undefined
            ? "Sign in as learner@demo.com (Demo1234!) to persist progress."
            : `Signed in as ${session.user.email} · status ${progress?.status ?? "NOT_STARTED"} · score ${progress?.score ?? "—"} · completed blocks ${completedBlocks.length}`}
        </p>
      </div>

      {parsed.data.map((block) => (
        <BlockRenderer
          block={block}
          completed={completedBlocks.includes(block.id)}
          courseId={lesson.module.courseId}
          key={block.id}
          lessonId={lesson.id}
        />
      ))}
    </div>
  );
}

export default function BlockPlaygroundPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <BlockPlaygroundContent />
      </Suspense>
    </main>
  );
}
