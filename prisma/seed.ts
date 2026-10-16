import {
  CourseSource,
  CourseStatus,
  Prisma,
  PrismaClient,
  Role,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Shared password for every demo account. */
const DEMO_PASSWORD = "Demo1234!";
const BCRYPT_ROUNDS = 10;

type DemoUser = {
  email: string;
  name: string;
  role: Role;
  background: string;
  goal: string;
};

const DEMO_USERS: DemoUser[] = [
  {
    email: "admin@demo.com",
    name: "Ada Admin",
    role: Role.ADMIN,
    background: "OTHER",
    goal: "Keep the platform healthy and review global engagement.",
  },
  {
    email: "instructor@demo.com",
    name: "Ivan Instructor",
    role: Role.INSTRUCTOR,
    background: "PRO_DEV",
    goal: "Author and customise interactive mini-courses.",
  },
  {
    email: "learner@demo.com",
    name: "Lena Learner",
    role: Role.LEARNER,
    background: "NON_CS",
    goal: "Learn how to use AI coding assistants responsibly.",
  },
];

const PLACEHOLDER_COURSE = {
  slug: "getting-started-with-genai-for-developers",
  title: "Getting Started with GenAI for Developers",
  description:
    "A placeholder mini-course used to verify the data model end to end. "
    + "It will be replaced by AI-generated content in later phases.",
  topic: "Software Development and Engineering",
  audience: "Non-CS beginners",
  difficulty: "beginner",
  coverEmoji: "📘",
  status: CourseStatus.DRAFT,
  source: CourseSource.SEED,
};

const PLACEHOLDER_MODULE_TITLE = "Module 1 · Foundations";
const PLACEHOLDER_LESSON_TITLE = "Lesson 1 · What Is GenAI?";

/** Reading block content, mirrors the block shape defined in docs/plan/01 §3. */
type ReadingBlock = {
  id: string;
  title: string;
  type: "reading";
  payload: {
    markdown: string;
  };
};

const PLACEHOLDER_BLOCKS: ReadingBlock[] = [
  {
    id: "blk_placeholder_reading",
    title: "What Is GenAI?",
    type: "reading",
    payload: {
      markdown: [
        "# What Is GenAI?",
        "",
        "Generative AI (GenAI) refers to models that create new content — text, "
        + "code, images — instead of only classifying existing data.",
        "",
        "This block is a **placeholder** seeded by `prisma/seed.ts`. It exists so the",
        "lesson renderer has a valid, well-formed block to display.",
      ].join("\n"),
    },
  },
];

async function seedUsers(passwordHash: string): Promise<Map<string, string>> {
  const idsByEmail = new Map<string, string>();

  for (const demoUser of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      update: {
        name: demoUser.name,
        role: demoUser.role,
        passwordHash,
      },
      create: {
        email: demoUser.email,
        name: demoUser.name,
        role: demoUser.role,
        passwordHash,
        background: demoUser.background,
        goal: demoUser.goal,
      },
    });
    idsByEmail.set(demoUser.email, user.id);
  }

  return idsByEmail;
}

async function seedPlaceholderCourse(createdById: string): Promise<string> {
  const course = await prisma.course.upsert({
    where: { slug: PLACEHOLDER_COURSE.slug },
    update: { createdById },
    create: { ...PLACEHOLDER_COURSE, createdById },
  });

  const existingModule = await prisma.module.findFirst({
    where: { courseId: course.id },
    orderBy: { order: "asc" },
  });

  const courseModule = existingModule
    ? await prisma.module.update({
        where: { id: existingModule.id },
        data: { title: PLACEHOLDER_MODULE_TITLE, order: 0 },
      })
    : await prisma.module.create({
        data: {
          courseId: course.id,
          title: PLACEHOLDER_MODULE_TITLE,
          order: 0,
        },
      });

  const existingLesson = await prisma.lesson.findFirst({
    where: { moduleId: courseModule.id },
    orderBy: { order: "asc" },
  });

  const blocks = PLACEHOLDER_BLOCKS as unknown as Prisma.InputJsonValue;

  if (existingLesson) {
    await prisma.lesson.update({
      where: { id: existingLesson.id },
      data: {
        title: PLACEHOLDER_LESSON_TITLE,
        order: 0,
        estimatedMinutes: 10,
        blocks,
      },
    });
  } else {
    await prisma.lesson.create({
      data: {
        moduleId: courseModule.id,
        title: PLACEHOLDER_LESSON_TITLE,
        order: 0,
        estimatedMinutes: 10,
        blocks,
      },
    });
  }

  return course.id;
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  const idsByEmail = await seedUsers(passwordHash);

  const instructorId = idsByEmail.get("instructor@demo.com");
  if (!instructorId) {
    throw new Error("Instructor demo user was not seeded.");
  }

  const courseId = await seedPlaceholderCourse(instructorId);

  console.log(`Seeded ${DEMO_USERS.length} demo users (password: ${DEMO_PASSWORD}).`);
  console.log(`Seeded placeholder course ${courseId} (${PLACEHOLDER_COURSE.slug}).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
