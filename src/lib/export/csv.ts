/**
 * Byte-order mark so Excel reads the file as UTF-8 instead of guessing the
 * platform code page; without it, an "·" in an account name renders as "Â·".
 */
const UTF8_BOM = "\uFEFF";

/** Quote per RFC 4180: only when the field needs it, doubling embedded quotes. */
export function csvField(value: string): string {
  const needsQuotes =
    /[",\r\n]/.test(value) || value !== value.trim();
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Header plus rows as CSV text: CRLF line endings, UTF-8 BOM prefix. */
export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvField).join(","));
  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}
