import { NextResponse } from "next/server";

export type ScrapedLabPhoto = {
  name: string;
  photoUrl: string;
};

function absoluteUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Best-effort scrape of name + image pairs from a public people/team page. */
export function scrapePeoplePhotosFromHtml(html: string, pageUrl: string): ScrapedLabPhoto[] {
  const photos: ScrapedLabPhoto[] = [];
  const seen = new Set<string>();

  const imgRe =
    /<img\b[^>]*\b(?:alt|title)\s*=\s*["']([^"']{2,80})["'][^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>|<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*\b(?:alt|title)\s*=\s*["']([^"']{2,80})["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const nameRaw = decodeEntities(m[1] || m[4] || "");
    const srcRaw = m[2] || m[3] || "";
    if (!nameRaw || !srcRaw) continue;
    if (/logo|icon|banner|spacer|arrow|button/i.test(nameRaw)) continue;
    if (!/[a-zA-Z]{2,}/.test(nameRaw)) continue;
    // Prefer person-like names (two+ words) but allow single names
    const photoUrl = absoluteUrl(srcRaw, pageUrl);
    if (!photoUrl || !/\.(jpe?g|png|webp|gif)(\?|$)/i.test(photoUrl)) continue;
    const key = `${nameRaw.toLowerCase()}|${photoUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    photos.push({ name: nameRaw, photoUrl });
  }

  return photos;
}

export async function POST(req: Request) {
  let pageUrl = "";
  try {
    const body = (await req.json()) as { pageUrl?: string };
    pageUrl = (body.pageUrl ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!pageUrl) {
    return NextResponse.json({ error: "pageUrl is required." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return NextResponse.json({ error: "Invalid page URL." }, { status: 400 });
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    return NextResponse.json({ error: "Only http(s) URLs are allowed." }, { status: 400 });
  }

  let html: string;
  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "LedgerRunwayPhotoImport/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not fetch page (${res.status}).` },
        { status: 502 }
      );
    }
    html = await res.text();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed." },
      { status: 502 }
    );
  }

  const photos = scrapePeoplePhotosFromHtml(html, parsed.toString());
  return NextResponse.json({ photos, count: photos.length });
}
