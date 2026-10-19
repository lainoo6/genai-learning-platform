import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import type { Translator } from "@/i18n/translate";
import { hashPassword, normaliseEmail } from "@/lib/auth";
import { MAX_IMPORT_ROWS, parseCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import type {
  ImportCredential,
  ImportFailure,
  ImportStudentsResult,
} from "@/lib/students";

/**
 * CSV student import (P5.2).
 *
 * Sits behind the `importStudents` server action, which owns the auth and file
 * checks. The rules implemented here:
 *
 * - an email that already has an account is enrolled, never duplicated;
 * - a new email gets a LEARNER account with a random 10-character temporary
 *   password (bcrypt), and the plaintext is returned exactly once;
 * - a row that cannot be enrolled is reported with its file row number and a
 *   human-readable reason, without aborting the rest of the file.
 *
 * Rows are processed in small batches so bcrypt hashing does not serialise a
 * large import, while a single bad row still only affects itself.
 */

const EMAIL_SCHEMA = z.email().max(200);
const ROW_CONCURRENCY = 8;
const PASSWORD_LENGTH = 10;
const MAX_NAME_LENGTH = 120;

/** Characters that are safe to read aloud from a printed credentials sheet. */
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function temporaryPassword(): string {
  const bytes = randomBytes(PASSWORD_LENGTH);
  return Array.from(
    bytes,
    (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length],
  ).join("");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === "P2002"
  );
}

type PreparedRow = {
  /** One-based record number in the file, header included. */
  row: number;
  name: string;
  email: string;
};

type PreparedRoster =
  | { ok: true; rows: PreparedRow[]; failures: ImportFailure[]; total: number }
  | { ok: false; error: string };

/**
 * Reads the `name,email` table out of CSV text.
 *
 * Column positions come from the header instead of being hard-coded, so a file
 * exported from a spreadsheet with extra columns still imports.
 */
function prepareRoster(text: string, t: Translator): PreparedRoster {
  const records = parseCsv(text);
  const headerIndex = records.findIndex((record) =>
    record.some((cell) => cell.trim().length > 0),
  );

  if (headerIndex === -1) {
    return {
      ok: false,
      error: t("server.import.emptyFile"),
    };
  }

  const header = records[headerIndex].map((cell) => cell.trim().toLowerCase());
  const nameIndex = header.indexOf("name");
  const emailIndex = header.indexOf("email");

  if (nameIndex === -1 || emailIndex === -1) {
    return {
      ok: false,
      error: t("server.import.badHeader"),
    };
  }

  const dataRows = records.slice(headerIndex + 1);
  const nonEmptyIndexes = dataRows.flatMap((record, index) =>
    record.some((cell) => cell.trim().length > 0) ? [index] : [],
  );

  if (nonEmptyIndexes.length === 0) {
    return {
      ok: false,
      error: t("server.import.headerOnly"),
    };
  }

  if (nonEmptyIndexes.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: t("server.import.tooManyRows", {
        count: nonEmptyIndexes.length.toLocaleString(),
        max: MAX_IMPORT_ROWS.toLocaleString(),
      }),
    };
  }

  const failures: ImportFailure[] = [];
  const rows: PreparedRow[] = [];
  const firstRowByEmail = new Map<string, number>();

  for (const index of nonEmptyIndexes) {
    const record = dataRows[index];
    const rowNumber = headerIndex + 2 + index;
    const name = (record[nameIndex] ?? "").trim().slice(0, MAX_NAME_LENGTH);
    const rawEmail = (record[emailIndex] ?? "").trim();

    if (name.length === 0) {
      failures.push({
        row: rowNumber,
        email: rawEmail,
        reason: t("server.import.nameMissing"),
      });
      continue;
    }

    const email = normaliseEmail(rawEmail);
    if (!EMAIL_SCHEMA.safeParse(email).success) {
      failures.push({
        row: rowNumber,
        email: rawEmail,
        reason: t("server.import.emailInvalid"),
      });
      continue;
    }

    const firstNameRow = firstRowByEmail.get(email);
    if (firstNameRow !== undefined) {
      failures.push({
        row: rowNumber,
        email,
        reason: t("server.import.duplicate", { row: firstNameRow }),
      });
      continue;
    }

    firstRowByEmail.set(email, rowNumber);
    rows.push({ row: rowNumber, name, email });
  }

  return { ok: true, rows, failures, total: nonEmptyIndexes.length };
}

type RowOutcome =
  | { kind: "imported"; credential: ImportCredential | null }
  | { kind: "already-enrolled" }
  | { kind: "failed"; failure: ImportFailure };

/** Enrols one prepared row, creating the account first when needed. */
async function importRow(
  courseId: string,
  entry: PreparedRow,
  t: Translator,
): Promise<RowOutcome> {
  try {
    const existing = await prisma.user.findUnique({
      where: { email: entry.email },
      select: { id: true },
    });

    if (existing !== null) {
      try {
        await prisma.enrollment.create({
          data: { userId: existing.id, courseId },
        });
        return { kind: "imported", credential: null };
      } catch (error: unknown) {
        if (isUniqueViolation(error)) {
          return { kind: "already-enrolled" };
        }
        throw error;
      }
    }

    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);

    try {
      await prisma.user.create({
        data: {
          name: entry.name,
          email: entry.email,
          passwordHash,
          role: "LEARNER",
          enrollments: { create: { courseId } },
        },
        select: { id: true },
      });

      return {
        kind: "imported",
        credential: { name: entry.name, email: entry.email, password },
      };
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) {
        throw error;
      }

      // The account appeared between the lookup and the insert — another
      // import or a registration raced us. Enrol it like an existing user.
      const raced = await prisma.user.findUnique({
        where: { email: entry.email },
        select: { id: true },
      });
      if (raced === null) {
        throw error;
      }

      try {
        await prisma.enrollment.create({
          data: { userId: raced.id, courseId },
        });
        return { kind: "imported", credential: null };
      } catch (enrollmentError: unknown) {
        if (isUniqueViolation(enrollmentError)) {
          return { kind: "already-enrolled" };
        }
        throw enrollmentError;
      }
    }
  } catch (error: unknown) {
    console.error("[students] failed to import row", entry.row, error);
    return {
      kind: "failed",
      failure: {
        row: entry.row,
        email: entry.email,
        reason: t("server.import.createFailed"),
      },
    };
  }
}

/** Runs `worker` over `items` with a bounded number of in-flight promises. */
async function mapWithConcurrency<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    for (;;) {
      const index = next;
      if (index >= items.length) {
        return;
      }
      next += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run()),
  );

  return results;
}

/** Parses and imports CSV text into a course. Callers must check ownership. */
export async function importStudentsFromCsv(
  courseId: string,
  text: string,
  t: Translator,
): Promise<ImportStudentsResult> {
  const prepared = prepareRoster(text, t);
  if (!prepared.ok) {
    return { ok: false, error: prepared.error };
  }

  const outcomes = await mapWithConcurrency(
    prepared.rows,
    ROW_CONCURRENCY,
    (entry) => importRow(courseId, entry, t),
  );

  let imported = 0;
  let alreadyEnrolled = 0;
  const credentials: ImportCredential[] = [];
  const failures: ImportFailure[] = [...prepared.failures];

  for (const outcome of outcomes) {
    if (outcome.kind === "imported") {
      imported += 1;
      if (outcome.credential !== null) {
        credentials.push(outcome.credential);
      }
    } else if (outcome.kind === "already-enrolled") {
      alreadyEnrolled += 1;
    } else {
      failures.push(outcome.failure);
    }
  }

  failures.sort((first, second) => first.row - second.row);

  return {
    ok: true,
    total: prepared.total,
    imported,
    newAccounts: credentials.length,
    alreadyEnrolled,
    failed: failures,
    credentials,
  };
}
