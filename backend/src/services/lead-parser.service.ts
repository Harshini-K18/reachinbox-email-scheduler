import { parse } from "csv-parse/sync";

const EMAIL_REGEX =
  /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

const extractEmailsFromText = (text: string): string[] => {
  const matches = text.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  );

  if (!matches) {
    return [];
  }

  return matches
    .map((email) => email.trim().toLowerCase())
    .filter((email) => EMAIL_REGEX.test(email));
};

export const parseLeadFile = (
  buffer: Buffer,
  filename: string
): string[] => {
  const content = buffer.toString("utf-8");

  if (!content.trim()) {
    return [];
  }

  const extension = filename
    .toLowerCase()
    .split(".")
    .pop();

  let emails: string[] = [];

  if (extension === "csv") {
    try {
      const records = parse(content, {
        skip_empty_lines: true,
        relax_column_count: true,
      });

      for (const row of records) {
        for (const value of row) {
          if (typeof value === "string") {
            emails.push(...extractEmailsFromText(value));
          }
        }
      }
    } catch {
      // Fall back to plain-text extraction if CSV parsing fails.
      emails = extractEmailsFromText(content);
    }
  } else {
    emails = extractEmailsFromText(content);
  }

  return [...new Set(emails)];
};