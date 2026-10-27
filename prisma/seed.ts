import {
  PrismaClient,
  Role,
} from "@prisma/client";
import bcrypt from "bcryptjs";

import { seedCourse, SEED_COURSE_SLUG } from "./seed-courses";
import { seedPhase3Courses } from "./seed-courses-phase3";

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

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
  const idsByEmail = await seedUsers(passwordHash);

  const instructorId = idsByEmail.get("instructor@demo.com");
  if (!instructorId) {
    throw new Error("Instructor demo user was not seeded.");
  }

  const seededCourse = await seedCourse(prisma, instructorId);
  const phase3Courses = await seedPhase3Courses(prisma, instructorId);

  console.log(`Seeded ${DEMO_USERS.length} demo users (password: ${DEMO_PASSWORD}).`);
  console.log(
    `Seeded seed course ${seededCourse.courseId} `
    + `(${SEED_COURSE_SLUG}, ${seededCourse.lessonCount} lessons).`,
  );

  for (const course of phase3Courses) {
    console.log(
      `Seeded seed course ${course.courseId} `
      + `(${course.slug}, ${course.lessonCount} lessons).`,
    );
  }
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
