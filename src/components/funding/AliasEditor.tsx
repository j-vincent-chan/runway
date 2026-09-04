"use client";

import type { FundingSource } from "@/types";
import { useApp } from "@/context/AppContext";
import {
  defaultAliasBase,
  getProjectNumber,
  projectDisplayCode,
  resolveAliasBase,
  stripProjectFromAlias,
} from "@/lib/funding/alias";
import { cn } from "@/lib/utils/cn";

/** Fixed input width so aliases align in timeline and account lists. */
export const ALIAS_INPUT_WIDTH_CLASS = "w-[11.5rem]";

export function AliasEditor({
  source,
  customAlias,
  accountTitle,
  onSave,
  compact = false,
  showProjectSuffix = true,
  fullWidth = false,
  className,
}: {
  source: FundingSource;
  customAlias?: string;
  /** Project description from the balance report — used when no custom alias is saved */
  accountTitle?: string;
  onSave: (aliasBase: string) => void;
  compact?: boolean;
  /** Hide gray project number beside input (e.g. Accounts page has chartstring column). */
  showProjectSuffix?: boolean;
  /** Show full alias text (Accounts table); timeline keeps fixed width. */
  fullWidth?: boolean;
  className?: string;
}) {
  const { fundingSources } = useApp();
  const project = getProjectNumber(source);
  // Disambiguated with the dept when another account shares this project code.
  const displayCode = projectDisplayCode(source, fundingSources);
  const base = resolveAliasBase(source, customAlias, accountTitle);
  const placeholder =
    accountTitle?.trim() || defaultAliasBase(source);

  return (
    <div
      className={cn(
        "flex items-center gap-1",
        !fullWidth && "min-w-0",
        compact && "whitespace-nowrap",
        fullWidth && "w-max max-w-full",
        className
      )}
    >
      <input
        key={`${source.id}:${base}`}
        type="text"
        defaultValue={base}
        placeholder={placeholder}
        title={`Friendly name · raw: ${source.accountString ?? source.rawName}${
          accountTitle ? ` · Report: ${accountTitle}` : ""
        }`}
        className={cn(
          "rounded border border-rule bg-surface px-2 py-1 text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent",
          compact
            ? cn(ALIAS_INPUT_WIDTH_CLASS, "shrink-0 text-xs")
            : fullWidth
              ? "min-w-[11.5rem] max-w-[36rem] w-auto text-sm [field-sizing:content]"
              : cn(ALIAS_INPUT_WIDTH_CLASS, "max-w-[280px] shrink-0 text-sm")
        )}
        onBlur={(e) => {
          const next = stripProjectFromAlias(e.target.value, project);
          onSave(next || accountTitle?.trim() || defaultAliasBase(source));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {showProjectSuffix && project && (
        <span
          className={cn(
            "shrink-0 whitespace-nowrap text-muted",
            compact ? "text-[10px]" : "text-xs"
          )}
          title="Project number (always appended)"
        >
          · {displayCode}
        </span>
      )}
    </div>
  );
}

export function AliasDisplay({
  source,
  customAlias,
  accountTitle,
  className,
}: {
  source: FundingSource;
  customAlias?: string;
  accountTitle?: string;
  className?: string;
}) {
  const { fundingSources } = useApp();
  const project = getProjectNumber(source);
  const displayCode = projectDisplayCode(source, fundingSources);
  const base = resolveAliasBase(source, customAlias, accountTitle);
  return (
    <span className={className} title={source.accountString ?? source.rawName}>
      {base}
      {project && <span className="text-muted"> · {displayCode}</span>}
    </span>
  );
}
