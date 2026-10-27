/**
 * Small RFC 4180 CSV reader/writer.
 *
 * The only CSV surface in the product is the student roster, but the input is
 * a user-supplied file, so the parser has to survive quoted cells, escaped
 * quotes, CRLF line endings and a leading BOM. Keeping it dependency-free also
 * makes the parsing rules testable in isolation.
 */

/** Upload limits shared by the server action and the import panel. */
export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_IMPORT_ROWS = 2_000;

/** Excel only detects UTF-8 when the file starts with this character. */
export const UTF8_BOM = "\uFEFF";

/**
 * Splits CSV text into records and cells.
 *
 * Empty trailing lines are dropped; everything else is returned verbatim so
 * callers can decide which rows are blank and how to number them.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let inQuotes = false;

  let index = text.startsWith(UTF8_BOM) ? UTF8_BOM.length : 0;

  while (index < text.length) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }

        inQuotes = false;
        index += 1;
        continue;
      }

      cell += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (character === ",") {
      record.push(cell);
      cell = "";
      index += 1;
      continue;
    }

    if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }

      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
      index += 1;
      continue;
    }

    cell += character;
    index += 1;
  }

  if (cell.length > 0 || record.length > 0) {
    record.push(cell);
    records.push(record);
  }

  return records;
}

/** Escapes one cell: quote it only when it contains a delimiter or a newline. */
export function toCsvRow(cells: ReadonlyArray<string>): string {
  return cells
    .map((cell) => {
      if (!/[",\r\n]/.test(cell)) {
        return cell;
      }

      return `"${cell.replaceAll('"', '""')}"`;
    })
    .join(",");
}

/** Builds a complete CSV document, prefixed with the UTF-8 BOM. */
export function toCsvDocument(
  rows: ReadonlyArray<ReadonlyArray<string>>,
): string {
  return `${UTF8_BOM}${rows.map((row) => `${toCsvRow(row)}\r\n`).join("")}`;
}
