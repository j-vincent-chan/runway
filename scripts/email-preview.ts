/**
 * Renders every Runway email with fixture data into exports/email-previews/
 * for eyeballing in a browser. Run: npx tsx scripts/email-preview.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  composeDelegationApprovedEmail,
  composeDelegationRequestEmail,
} from "../src/lib/email/composeDelegation";
import { composeLockInEmail } from "../src/lib/email/composeLockIn";
import { composeDigestEmail, type DigestPiSection } from "../src/lib/digest/compose";

const APP = "https://ucsf-runway.vercel.app";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "exports", "email-previews");
mkdirSync(outDir, { recursive: true });

const digestSection: DigestPiSection = {
  piEmail: "vincent.chan@ucsf.edu",
  items: [
    {
      personName: "Reid R Bolus",
      kind: "new",
      sentences: ["Admin Enrichment (#128070): 75% → 50% from Sep 2026"],
    },
    {
      personName: "Ohnmar Chase",
      kind: "updated",
      sentences: ["St. Mary's Hospital: 37.5% → 50% from Nov 2026"],
      revisedWhileInProgress: true,
    },
    { personName: "Vincent Chan", kind: "withdrawn", sentences: [] },
  ],
  backlog: { openCount: 2, oldestSubmitted: "Aug 12, 2026" },
};

const previews: Record<string, string> = {
  "delegation-request.html": composeDelegationRequestEmail({
    analystName: "Priya Patel",
    analystEmail: "priya@university.edu",
    note: "I handle the Chan Lab's post-award.",
    appUrl: APP,
  }).html,
  "delegation-approved.html": composeDelegationApprovedEmail({
    piEmail: "vincent.chan@ucsf.edu",
    analystName: "Priya Patel",
    appUrl: APP,
  }).html,
  "lock-in.html": composeLockInEmail({
    requestedBy: "vincent.chan@ucsf.edu",
    personName: "Reid R Bolus",
    sentences: [
      "Admin Enrichment (#128070): 75% → 50% from Sep 2026",
      "NIH R01 (#204411): 25% → 50% from Sep 2026",
    ],
    appUrl: APP,
  }).html,
  "digest.html": composeDigestEmail([digestSection], "Aug 31, 2026", APP).html,
};

// Supabase templates with the Go-template vars naively substituted.
for (const [file, out] of [
  ["confirm-signup.html", "supabase-confirm-signup.html"],
  ["reset-password.html", "supabase-reset-password.html"],
] as const) {
  previews[out] = readFileSync(join(root, "emails", "supabase", file), "utf8")
    .replace(/\{\{ if \.Data\.full_name \}\}/g, "")
    .replace(/\{\{ end \}\}/g, "")
    .replace(/\{\{ \.Data\.full_name \}\}/g, "Vincent Chan")
    .replace(/\{\{ \.ConfirmationURL \}\}/g, `${APP}/auth/confirm#access_token=preview`)
    .replace(/\{\{ \.Email \}\}/g, "vincent.chan@ucsf.edu");
}

for (const [name, html] of Object.entries(previews)) {
  writeFileSync(join(outDir, name), html);
}
console.log(`Wrote ${Object.keys(previews).length} previews to ${outDir}`);
console.log("Open them with: open exports/email-previews/*.html");
