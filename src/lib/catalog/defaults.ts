import type { AccountGroupDef, FundingSourceTypeDef, PersonnelGroupDef } from "@/types";

/** Built-in personnel groups (seed + migration defaults). */
export const DEFAULT_PERSONNEL_GROUPS: PersonnelGroupDef[] = [
  {
    id: "researchDevelopment",
    label: "Research development",
    pillClass: "bg-[#99f6e4] text-[#134e4a] ring-1 ring-[#99f6e4]/50",
    dotClass: "bg-[#0f766e]",
    chartColor: "#0f766e",
    sortOrder: 0,
  },
  {
    id: "projectManagementClinical",
    label: "Project management & clinical coordination",
    shortLabel: "PM & clinical coord.",
    pillClass: "bg-[#ddd6fe] text-[#4c1d95] ring-1 ring-[#ddd6fe]/50",
    dotClass: "bg-[#5b21b6]",
    chartColor: "#5b21b6",
    sortOrder: 1,
  },
  {
    id: "dataManagement",
    label: "Data management",
    pillClass: "bg-[#bfdbfe] text-[#1e3a8a] ring-1 ring-[#bfdbfe]/50",
    dotClass: "bg-[#1d4ed8]",
    chartColor: "#1d4ed8",
    sortOrder: 2,
  },
  {
    id: "communityManagement",
    label: "Community management",
    pillClass: "bg-[#fed7aa] text-[#7c2d12] ring-1 ring-[#fed7aa]/50",
    dotClass: "bg-[#c2410c]",
    chartColor: "#c2410c",
    sortOrder: 3,
  },
];

/** Built-in funding source types (seed + migration defaults). */
export const DEFAULT_FUNDING_SOURCE_TYPES: FundingSourceTypeDef[] = [
  {
    id: "startup",
    label: "Start-up",
    pillClass: "bg-[#0c2340] text-white ring-1 ring-[#0c2340]/30",
    dotClass: "bg-slate-200",
    chartColor: "#0c2340",
    sortOrder: 0,
  },
  {
    id: "projects",
    label: "Projects",
    pillClass: "bg-[#f4a89a] text-[#5c2018] ring-1 ring-[#f4a89a]/50",
    dotClass: "bg-[#b42318]",
    chartColor: "#b42318",
    sortOrder: 1,
  },
  {
    id: "endowment",
    label: "Endowment",
    pillClass: "bg-[#9ee0c4] text-[#134d32] ring-1 ring-[#9ee0c4]/50",
    dotClass: "bg-[#047857]",
    chartColor: "#047857",
    sortOrder: 2,
  },
  {
    id: "institutional",
    label: "Institutional support",
    pillClass: "bg-[#f5d76e] text-[#5c4a0a] ring-1 ring-[#f5d76e]/50",
    dotClass: "bg-[#a16207]",
    chartColor: "#a16207",
    sortOrder: 3,
  },
  {
    id: "largeGrants",
    label: "Large grants",
    pillClass: "bg-[#c4b5fd] text-[#3b2667] ring-1 ring-[#c4b5fd]/50",
    dotClass: "bg-[#6d28d9]",
    chartColor: "#6d28d9",
    sortOrder: 4,
  },
  {
    id: "researchPlanReviews",
    label: "Research plan reviews",
    pillClass: "bg-[#93c5fd] text-[#1e3a5f] ring-1 ring-[#93c5fd]/50",
    dotClass: "bg-[#1d4ed8]",
    chartColor: "#1d4ed8",
    sortOrder: 5,
  },
];

const PILL_PALETTE = [
  {
    pillClass: "bg-[#99f6e4] text-[#134e4a] ring-1 ring-[#99f6e4]/50",
    dotClass: "bg-[#0f766e]",
    chartColor: "#0f766e",
  },
  {
    pillClass: "bg-[#ddd6fe] text-[#4c1d95] ring-1 ring-[#ddd6fe]/50",
    dotClass: "bg-[#5b21b6]",
    chartColor: "#5b21b6",
  },
  {
    pillClass: "bg-[#bfdbfe] text-[#1e3a8a] ring-1 ring-[#bfdbfe]/50",
    dotClass: "bg-[#1d4ed8]",
    chartColor: "#1d4ed8",
  },
  {
    pillClass: "bg-[#fed7aa] text-[#7c2d12] ring-1 ring-[#fed7aa]/50",
    dotClass: "bg-[#c2410c]",
    chartColor: "#c2410c",
  },
  {
    pillClass: "bg-[#fce7f3] text-[#9d174d] ring-1 ring-[#fce7f3]/50",
    dotClass: "bg-[#be185d]",
    chartColor: "#be185d",
  },
  {
    pillClass: "bg-[#fef3c7] text-[#92400e] ring-1 ring-[#fef3c7]/50",
    dotClass: "bg-[#b45309]",
    chartColor: "#b45309",
  },
];

export function nextCatalogStyle(index: number) {
  return PILL_PALETTE[index % PILL_PALETTE.length]!;
}

export function slugifyCatalogId(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return base || `item_${Date.now().toString(36)}`;
}

/**
 * The two account groups every workspace has.
 *
 * "Not my account" is a fact about an account, not about one person's slice of
 * it, so it lives here rather than per person-and-fund. Only this group is ever
 * stored against an account: anything unassigned reads as "My accounts", which
 * keeps one meaning per stored value instead of writing a row for every account
 * just to say "normal".
 */
export const MY_ACCOUNTS_GROUP_ID = "myAccounts";
export const NOT_MY_ACCOUNTS_GROUP_ID = "notMyAccounts";

/** Structural, not a user tag — deleting it would leave marked accounts nowhere to sit. */
export const UNDELETABLE_ACCOUNT_GROUP_IDS = [NOT_MY_ACCOUNTS_GROUP_ID];

export const DEFAULT_ACCOUNT_GROUPS: AccountGroupDef[] = [
  {
    id: MY_ACCOUNTS_GROUP_ID,
    label: "My accounts",
    pillClass: "bg-[#ccfbf1] text-[#134e4a] ring-1 ring-[#ccfbf1]/50",
    dotClass: "bg-[#0d9488]",
    chartColor: "#0d9488",
    sortOrder: 0,
  },
  {
    id: NOT_MY_ACCOUNTS_GROUP_ID,
    label: "Not my accounts",
    pillClass: "bg-[#e2e8f0] text-[#334155] ring-1 ring-[#e2e8f0]/50",
    dotClass: "bg-[#64748b]",
    chartColor: "#64748b",
    sortOrder: 1,
  },
];
