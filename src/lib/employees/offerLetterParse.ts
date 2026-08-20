import { format, isValid, parse } from "date-fns";

const MONTH_NAMES =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

const DATE_PATTERNS: { re: RegExp; parse: (m: RegExpMatchArray) => Date | null }[] = [
  {
    re: new RegExp(`\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "i"),
    parse: (m) => parse(`${m[1]} ${m[2]}, ${m[3]}`, "MMMM d, yyyy", new Date()),
  },
  {
    re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_NAMES})\\s+(\\d{4})\\b`, "i"),
    parse: (m) => parse(`${m[2]} ${m[1]}, ${m[3]}`, "MMMM d, yyyy", new Date()),
  },
  {
    re: /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/,
    parse: (m) => {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      let y = parseInt(m[3], 10);
      if (y < 100) y += y >= 70 ? 1900 : 2000;
      const us = parse(`${a}/${b}/${y}`, "M/d/yyyy", new Date());
      if (isValid(us)) return us;
      return parse(`${b}/${a}/${y}`, "M/d/yyyy", new Date());
    },
  },
  {
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/,
    parse: (m) => parse(`${m[1]}-${m[2]}-${m[3]}`, "yyyy-MM-dd", new Date()),
  },
];

const START_LABELS = [
  /start\s*date\s*[:\-]?\s*/i,
  /anticipated\s*start\s*(?:date)?\s*[:\-]?\s*/i,
  /commencement\s*(?:of\s*employment|date)?\s*[:\-]?\s*/i,
  /effective\s*date\s*(?:of\s*employment)?\s*[:\-]?\s*/i,
  /date\s*of\s*hire\s*[:\-]?\s*/i,
  /employment\s*(?:will\s*)?begin(?:s|ning)?\s*(?:on)?\s*[:\-]?\s*/i,
  /shall\s*commence\s*(?:on)?\s*[:\-]?\s*/i,
];

const END_LABELS = [
  /end\s*date\s*[:\-]?\s*/i,
  /termination\s*date\s*[:\-]?\s*/i,
  /last\s*day\s*(?:of\s*employment)?\s*[:\-]?\s*/i,
  /employment\s*ends?\s*(?:on)?\s*[:\-]?\s*/i,
];

const SALARY_LABELS = [
  /(?:annual|yearly)\s*(?:base\s*)?(?:salary|compensation|pay)\s*[:\-]?\s*/i,
  /(?:base\s*)?(?:salary|compensation)\s*(?:of|:)?\s*/i,
  /starting\s*(?:annual\s*)?(?:salary|compensation)\s*[:\-]?\s*/i,
  /rate\s*of\s*pay\s*[:\-]?\s*/i,
];

function parseMoneyNear(text: string, fromIndex: number): number | undefined {
  const slice = text.slice(fromIndex, fromIndex + 80);
  const m = slice.match(/\$?\s*([\d,]{2,9}(?:\.\d{1,2})?)/);
  if (!m) return undefined;
  const n = parseFloat(m[1]!.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 1000 || n > 2_000_000) return undefined;
  return n;
}

function findSalaryInText(text: string): number | undefined {
  const normalized = text.replace(/\s+/g, " ");
  for (const label of SALARY_LABELS) {
    const re = new RegExp(label.source, label.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(normalized)) !== null) {
      const amount = parseMoneyNear(normalized, m.index + m[0].length);
      if (amount != null) return amount;
    }
  }
  return undefined;
}

function toIsoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function firstDateInText(text: string): string | undefined {
  let best: { iso: string; index: number } | undefined;
  for (const { re, parse: parseMatch } of DATE_PATTERNS) {
    const reGlobal = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = reGlobal.exec(text)) !== null) {
      const d = parseMatch(m);
      if (!d || !isValid(d)) continue;
      const year = d.getFullYear();
      if (year < 1990 || year > 2100) continue;
      const iso = toIsoDate(d);
      if (!best || m.index < best.index) best = { iso, index: m.index };
    }
  }
  return best?.iso;
}

function findDateNearLabels(text: string, labels: RegExp[]): string | undefined {
  const normalized = text.replace(/\s+/g, " ");
  for (const label of labels) {
    const re = new RegExp(label.source, label.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(normalized)) !== null) {
      const slice = normalized.slice(m.index + m[0].length, m.index + m[0].length + 140);
      const iso = firstDateInText(slice);
      if (iso) return iso;
    }
  }
  return undefined;
}

export function extractDatesFromOfferLetterText(text: string): {
  startDate?: string;
  endDate?: string;
  startingSalary?: number;
} {
  const startDate = findDateNearLabels(text, START_LABELS);
  const endDate = findDateNearLabels(text, END_LABELS);
  const startingSalary = findSalaryInText(text);
  return { startDate, endDate, startingSalary };
}

export async function extractTextFromOfferLetterFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("text/") || name.endsWith(".txt")) {
    return file.text();
  }

  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    if (typeof window !== "undefined") {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return parts.join("\n");
  }

  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }

  throw new Error("Upload a PDF, Word (.docx), or plain-text offer letter.");
}

export async function parseOfferLetterFile(file: File): Promise<{
  text: string;
  startDate?: string;
  endDate?: string;
  startingSalary?: number;
}> {
  const text = await extractTextFromOfferLetterFile(file);
  const dates = extractDatesFromOfferLetterText(text);
  return { text, ...dates };
}

export const OFFER_LETTER_ACCEPT =
  ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";
export const OFFER_LETTER_MAX_BYTES = 12 * 1024 * 1024;
