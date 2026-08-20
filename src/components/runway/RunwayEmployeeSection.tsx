"use client";

import { useState } from "react";
import { isRunwayDeficit, type EmployeeRunwaySummary } from "@/lib/runway/calculate";
import { RunwayBar } from "@/components/runway/RunwayBar";
import {
  formatCurrency,
  formatCurrencyBalance,
  formatIsoDateDisplay,
  parseCurrency,
  roundCurrencyAmount,
  hasPercentEffort,
} from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";
import { ChevronDown, ChevronRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { AssumedOkFundingCell } from "@/components/runway/AssumedOkFundingCell";
import { RunwayIndicatorBadge } from "@/components/runway/RunwayIndicatorBadge";
import type { RunwayAccountLine } from "@/lib/runway/calculate";

export function RunwayEmployeeSection({
  summary,
  revealHidden,
  onRevealHidden,
  onToggleHidden,
  onToggleAssumedOk,
  onAssumedEndDateChange,
  onBalanceChange,
  onBurnChange,
  onBurnReset,
}: {
  summary: EmployeeRunwaySummary;
  revealHidden: boolean;
  onRevealHidden: () => void;
  onToggleHidden: (fundingSourceId: string) => void;
  onToggleAssumedOk: (fundingSourceId: string) => void;
  onAssumedEndDateChange: (fundingSourceId: string, endDate: string | null) => void;
  onBalanceChange: (chartstring: string, value: number | null) => void;
  onBurnChange: (fundingSourceId: string, percentEffort: number, monthlyBurn: number) => void;
  onBurnReset: (fundingSourceId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const {
    employee,
    accounts,
    hiddenAccountCount,
    totalBalance,
    totalMonthlyBurn,
    blendedMonthsRunway,
  } = summary;

  if (accounts.length === 0 && hiddenAccountCount === 0) return null;

  const visibleCount = accounts.filter((a) => !a.isHidden).length;
  const assumedOkVisibleCount = accounts.filter((a) => !a.isHidden && a.isAssumedOk).length;
  const runwayVisibleCount = accounts.filter((a) => !a.isHidden && !a.isAssumedOk).length;
  const latestBalanceAsOf = accounts
    .filter((a) => !a.isHidden && !a.isAssumedOk && a.balanceSource === "portfolio" && a.portfolioRunDate)
    .map((a) => a.portfolioRunDate!)
    .sort()
    .at(-1);
  const allVisibleAssumedOk =
    visibleCount > 0 && runwayVisibleCount === 0 && assumedOkVisibleCount > 0;
  const hasDeficit =
    !allVisibleAssumedOk &&
    (isRunwayDeficit(blendedMonthsRunway) ||
      accounts.some(
        (a) => !a.isHidden && !a.isAssumedOk && isRunwayDeficit(a.monthsRunway)
      ));

  return (
    <section
      className={cn(
        "rounded-xl border shadow-sm",
        hasDeficit ? "border-red-200 bg-red-50/80" : "border-slate-200 bg-white"
      )}
    >
      <div className="flex w-full items-start gap-3 px-4 py-3">
        <button
          type="button"
          className="mt-0.5 shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-100"
          aria-expanded={open}
          aria-label={open ? "Collapse accounts" : "Expand accounts"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "min-w-0 flex-1 cursor-pointer text-left",
            hasDeficit ? "hover:bg-red-100/50" : "hover:bg-slate-50/80"
          )}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-[#0c2340]">{employee.name}</h3>
            <p className="text-xs text-slate-500">
              {visibleCount} active account{visibleCount === 1 ? "" : "s"}
              {employee.employeeId && ` · ${employee.employeeId}`}
            </p>
          </div>
          {visibleCount > 0 && (
            <>
              {allVisibleAssumedOk ? (
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                  <RunwayIndicatorBadge
                    variant="assumedOk"
                    title="Accounts are not yours — runway is not calculated"
                  >
                    Assumed OK
                  </RunwayIndicatorBadge>
                  <span>
                    {assumedOkVisibleCount} account{assumedOkVisibleCount === 1 ? "" : "s"} not
                    under your control
                  </span>
                </p>
              ) : (
                <>
                  <div className="mt-2">
                    <RunwayBar
                      months={blendedMonthsRunway}
                      showLabel={!isRunwayDeficit(blendedMonthsRunway)}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Combined net balance{" "}
                    <span className="font-semibold text-[#0c2340]">
                      {formatCurrency(totalBalance)}
                    </span>
                    {latestBalanceAsOf && (
                      <span className="text-slate-500">
                        {" "}
                        as of {formatIsoDateDisplay(latestBalanceAsOf)}
                      </span>
                    )}
                    {" · "}
                    {formatCurrency(totalMonthlyBurn)}/mo shared burn
                    {assumedOkVisibleCount > 0 && (
                      <span className="text-slate-400">
                        {" "}
                        · {assumedOkVisibleCount} assumed OK
                      </span>
                    )}
                  </p>
                </>
              )}
            </>
          )}
        </div>
        {hiddenAccountCount > 0 && !revealHidden && (
          <button
            type="button"
            className="shrink-0 self-start rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-600 hover:bg-slate-200"
            title="Show hidden accounts for this person"
            onClick={onRevealHidden}
          >
            {hiddenAccountCount} hidden · show
          </button>
        )}
      </div>

      {open && accounts.length > 0 && (
        <div className="overflow-x-auto border-t">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-xs font-medium text-slate-600">
              <tr>
                <th className="w-14 px-2 py-2.5" />
                <th className="min-w-[11.5rem] px-3 py-2.5 text-left font-medium">Chartstring</th>
                <th className="min-w-[14rem] px-3 py-2.5 text-left font-medium">Account</th>
                <th className="min-w-[10.5rem] px-3 py-2.5 text-right font-medium">Net balance</th>
                <th className="min-w-[9.5rem] px-3 py-2.5 text-right font-medium">% · Mo. burn</th>
                <th className="min-w-[15.5rem] px-4 py-2.5 text-right font-medium">Runway</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acct) => {
                const isLinked = acct.sharedContributorCount > 1;
                const isManualBalance = acct.balanceSource === "manual";
                const isManualBurn = acct.burnIsOverride;
                const isDeficit =
                  !acct.isHidden && !acct.isAssumedOk && isRunwayDeficit(acct.monthsRunway);

                return (
                <tr
                  key={acct.fundingSourceId}
                  className={cn(
                    "border-t align-middle",
                    hasDeficit ? "border-red-100" : "border-slate-100",
                    acct.isHidden && "bg-slate-50/80",
                    acct.isAssumedOk &&
                      !acct.isHidden &&
                      "border-l-2 border-l-slate-300 bg-slate-50/50",
                    isDeficit && "bg-red-50/80",
                    !isDeficit &&
                      !acct.isAssumedOk &&
                      !acct.isHidden &&
                      isLinked &&
                      "bg-violet-50/50",
                    !isDeficit &&
                      !acct.isAssumedOk &&
                      !acct.isHidden &&
                      !isLinked &&
                      isManualBalance &&
                      "bg-teal-50/30"
                  )}
                >
                  <td className="px-2 py-2.5">
                    <div className="inline-flex gap-0.5 rounded-md bg-slate-100/70 p-0.5">
                      <button
                        type="button"
                        className={cn(
                          "rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
                          acct.isHidden
                            ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200/90 hover:bg-amber-200"
                            : "text-slate-400 hover:bg-amber-50 hover:text-amber-700"
                        )}
                        title={
                          acct.isHidden
                            ? "Include this fund in timeline and runway totals"
                            : "Hide fund (not under your control)"
                        }
                        onClick={() => onToggleHidden(acct.fundingSourceId)}
                      >
                        {acct.isHidden ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {!acct.isHidden && (
                        <button
                          type="button"
                          className={cn(
                            "rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60",
                            acct.isAssumedOk
                              ? "bg-sky-100 text-sky-800 ring-1 ring-sky-200/90 hover:bg-sky-200"
                              : "text-slate-400 hover:bg-sky-50 hover:text-sky-700"
                          )}
                          title={
                            acct.isAssumedOk
                              ? "Apply runway to this account again"
                              : "Not my account — assume they'll be fine; skip runway"
                          }
                          onClick={() => onToggleAssumedOk(acct.fundingSourceId)}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-500",
                      acct.isHidden && "opacity-60"
                    )}
                    title={acct.chartstring}
                  >
                    {acct.chartstring}
                  </td>
                  <td
                    className={cn(
                      "min-w-[14rem] max-w-[18rem] px-3 py-2.5 text-slate-800",
                      acct.isHidden && "opacity-60"
                    )}
                    title={acct.displayName}
                  >
                    <span className="block text-sm leading-snug">{acct.displayName}</span>
                    {!acct.isHidden && acct.isAssumedOk && (
                      <p className="mt-0.5 text-[10px] text-slate-500">External account</p>
                    )}
                    {!acct.isHidden && !acct.isAssumedOk && isLinked && (
                      <AccountIndicators acct={acct} isLinked={isLinked} />
                    )}
                    {acct.isHidden && (
                      <span className="ml-1 text-[10px] text-slate-400">(hidden)</span>
                    )}
                  </td>
                  <td className={cn("px-3 py-2.5 text-right", acct.isHidden && "opacity-60")}>
                    {acct.isAssumedOk && !acct.isHidden ? (
                      <AssumedOkFundingCell
                        endDate={acct.assumedEndDate}
                        estimatedBalance={acct.balance}
                        hasEstimate={acct.balanceSource === "estimated"}
                        sharedMonthlyBurn={acct.sharedMonthlyBurn}
                        onEndDateChange={(d) =>
                          onAssumedEndDateChange(acct.fundingSourceId, d)
                        }
                      />
                    ) : (
                      <BalanceInput
                        value={acct.balance}
                        source={acct.balanceSource}
                        asOfDate={acct.portfolioRunDate}
                        portfolioHint={
                          acct.balanceSource === "portfolio"
                            ? [acct.portfolioFile, formatIsoDateDisplay(acct.portfolioRunDate)]
                                .filter(Boolean)
                                .join(" · ")
                            : undefined
                        }
                        onCommit={(v) => onBalanceChange(acct.chartstring, v)}
                      />
                    )}
                  </td>
                  <td className={cn("px-3 py-2.5 text-right", acct.isHidden && "opacity-60")}>
                    <BurnPercentInput
                      percentEffort={acct.percentEffort}
                      monthlyBurn={acct.monthlyBurn}
                      monthlyCompensation={acct.monthlyCompensation}
                      isLinked={isLinked}
                      sharedMonthlyBurn={acct.sharedMonthlyBurn}
                      sharedContributorCount={acct.sharedContributorCount}
                      isOverride={isManualBurn}
                      disabled={acct.isHidden}
                      readOnly={acct.isAssumedOk}
                      onCommitPercent={(pct, burn) =>
                        onBurnChange(acct.fundingSourceId, pct, burn)
                      }
                      onCommitBurn={(pct, burn) =>
                        onBurnChange(acct.fundingSourceId, pct, burn)
                      }
                      onReset={() => onBurnReset(acct.fundingSourceId)}
                    />
                  </td>
                  <td className={cn("px-4 py-2.5", acct.isHidden && "opacity-60")}>
                    <div className="flex justify-end">
                      {acct.isAssumedOk && !acct.isHidden ? (
                        acct.balanceSource === "estimated" && acct.monthsRunway !== null ? (
                          <RunwayBar
                            months={acct.monthsRunway}
                            showLabel
                            showScale={false}
                          />
                        ) : (
                          <span className="text-[11px] text-slate-400">Set fund end date</span>
                        )
                      ) : (
                        <RunwayBar
                          months={acct.isHidden ? null : acct.monthsRunway}
                          showLabel={!acct.isHidden}
                          showScale={false}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AccountIndicators({
  acct,
  isLinked,
}: {
  acct: RunwayAccountLine;
  isLinked: boolean;
}) {
  if (!isLinked) return null;

  return (
    <p
      className="mt-0.5 text-[10px] text-violet-700"
      title={`${acct.sharedContributorCount} people on this account · ${formatCurrency(acct.sharedMonthlyBurn)}/mo combined burn`}
    >
      Shared · {acct.sharedContributorCount} people · {formatCurrency(acct.sharedMonthlyBurn)}/mo
    </p>
  );
}

function BurnPercentInput({
  percentEffort,
  monthlyBurn,
  monthlyCompensation,
  isLinked,
  sharedMonthlyBurn,
  sharedContributorCount,
  isOverride,
  disabled,
  readOnly,
  onCommitPercent,
  onCommitBurn,
  onReset,
}: {
  percentEffort: number;
  monthlyBurn: number;
  monthlyCompensation: number;
  isLinked: boolean;
  sharedMonthlyBurn: number;
  sharedContributorCount: number;
  isOverride: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  onCommitPercent: (percent: number, burn: number) => void;
  onCommitBurn: (percent: number, burn: number) => void;
  onReset: () => void;
}) {
  const [pctDraft, setPctDraft] = useState("");
  const [burnDraft, setBurnDraft] = useState("");
  const [editingPct, setEditingPct] = useState(false);
  const [editingBurn, setEditingBurn] = useState(false);
  const [pctDirty, setPctDirty] = useState(false);
  const [burnDirty, setBurnDirty] = useState(false);

  const canLink = monthlyCompensation > 0;

  const burnMatches = (pct: number, burn: number) =>
    Math.abs(pct - percentEffort) < 0.05 &&
    (Math.abs(burn - monthlyBurn) < 0.5 || (burn <= 0 && monthlyBurn <= 0));

  const commitPercent = (raw: string) => {
    if (!pctDirty) return;
    const pct = Math.max(0, parseFloat(raw) || 0);
    const burn = canLink ? (monthlyCompensation * pct) / 100 : monthlyBurn;
    if (burnMatches(pct, burn)) return;
    onCommitPercent(pct, burn);
  };

  const commitBurn = (raw: string) => {
    if (!burnDirty) return;
    const burn = Math.max(0, parseFloat(raw.replace(/[^0-9.-]/g, "")) || 0);
    const pct = canLink ? (burn / monthlyCompensation) * 100 : percentEffort;
    if (burnMatches(pct, burn)) return;
    onCommitBurn(pct, burn);
  };

  if (disabled) {
    return <span className="text-slate-400">—</span>;
  }

  const showEmpty = !hasPercentEffort(percentEffort) && monthlyBurn === 0;

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          readOnly={readOnly}
          disabled={!readOnly && !canLink && monthlyBurn > 0}
          className={cn(
            "w-12 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-right text-xs tabular-nums shadow-sm",
            readOnly && "cursor-default bg-slate-50 text-slate-600",
            isOverride ? "border-teal-500 bg-teal-50/50" : "border-slate-200 bg-white",
            isLinked && !isOverride && "border-violet-300 bg-violet-50/50",
            !canLink && !readOnly && "opacity-50"
          )}
          title={
            canLink
              ? "Percent of monthly compensation on this account"
              : "Monthly compensation unknown — edit dollars only"
          }
          value={
            editingPct
              ? pctDraft
              : showEmpty
                ? ""
                : String(Math.round(percentEffort * 10) / 10)
          }
          onFocus={() => {
            if (readOnly) return;
            setPctDraft(showEmpty ? "" : String(percentEffort));
            setPctDirty(false);
            setEditingPct(true);
          }}
          onChange={(e) => {
            setPctDirty(true);
            setPctDraft(e.target.value.replace(/[^0-9.]/g, ""));
          }}
          onBlur={() => {
            setEditingPct(false);
            if (pctDraft.trim() !== "") commitPercent(pctDraft);
            setPctDirty(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitPercent(pctDraft);
              setEditingPct(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="text-[10px] text-slate-400">%</span>
        <span className="text-slate-300">·</span>
        <input
          type="text"
          inputMode="decimal"
          readOnly={readOnly}
          className={cn(
            "w-[4.5rem] rounded-md border border-slate-200 bg-white px-1.5 py-1 text-right text-xs tabular-nums shadow-sm",
            readOnly && "cursor-default bg-slate-50 text-slate-600",
            isOverride ? "border-teal-500 bg-teal-50/50" : "border-slate-200 bg-white",
            isLinked && !isOverride && "border-violet-300 bg-violet-50/50"
          )}
          title={
            isLinked
              ? `Your share of burn; runway uses ${formatCurrency(sharedMonthlyBurn)}/mo combined`
              : "Monthly payroll burn on this account"
          }
          value={
            editingBurn
              ? burnDraft
              : monthlyBurn > 0
                ? String(Math.round(monthlyBurn))
                : ""
          }
          onFocus={() => {
            if (readOnly) return;
            setBurnDraft(monthlyBurn > 0 ? String(monthlyBurn) : "");
            setBurnDirty(false);
            setEditingBurn(true);
          }}
          onChange={(e) => {
            setBurnDirty(true);
            setBurnDraft(e.target.value.replace(/[^0-9.-]/g, ""));
          }}
          onBlur={() => {
            setEditingBurn(false);
            if (burnDraft.trim() !== "") commitBurn(burnDraft);
            setBurnDirty(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitBurn(burnDraft);
              setEditingBurn(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>
      {(isLinked || (isOverride && !readOnly)) && (
        <p className="max-w-[11rem] text-right text-[10px] leading-snug text-slate-500">
          {isLinked && (
            <span
              className="text-violet-700"
              title={`${sharedContributorCount} people · combined burn for runway`}
            >
              {formatCurrency(sharedMonthlyBurn)}/mo combined
            </span>
          )}
          {isOverride && !readOnly && (
            <>
              {isLinked && " · "}
              <button type="button" className="text-teal-700 hover:underline" onClick={onReset}>
                Reset burn
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function BalanceInput({
  value,
  source,
  asOfDate,
  portfolioHint,
  disabled,
  onCommit,
}: {
  value: number;
  source: "portfolio" | "manual" | "estimated" | "none";
  asOfDate?: string;
  portfolioHint?: string;
  disabled?: boolean;
  onCommit: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);

  const numericValue = typeof value === "number" ? value : parseCurrency(value);
  const hasValue = numericValue !== null && Number.isFinite(numericValue);
  const displayValue = hasValue ? formatCurrencyBalance(numericValue) : "";
  const asOfLabel = formatIsoDateDisplay(asOfDate);

  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        className={cn(
          "w-[7.75rem] rounded-md border px-2 py-1 text-right text-sm font-semibold tabular-nums text-[#0c2340] shadow-sm",
          disabled && "cursor-not-allowed opacity-50",
          source === "manual" && "border-teal-500 bg-teal-50/50",
          source === "portfolio" && "border-teal-200 bg-white",
          source === "none" && !disabled && "border-amber-300 bg-amber-50/80",
          source === "none" && disabled && "border-slate-200 bg-slate-50"
        )}
        title={
          portfolioHint ??
          (source === "manual"
            ? "Manual balance"
            : source === "none"
              ? "Enter balance or upload MyPortfolio report"
              : undefined)
        }
        value={editing ? draft : displayValue}
        onFocus={() => {
          setDraft(hasValue ? roundCurrencyAmount(numericValue!).toFixed(2) : "");
          setDirty(false);
          setEditing(true);
        }}
        onChange={(e) => {
          setDirty(true);
          setDraft(e.target.value.replace(/[^0-9.,$-]/g, ""));
        }}
        onBlur={() => {
          setEditing(false);
          if (!dirty) return;
          const parsed = parseCurrency(draft);
          if (draft.trim() === "" || parsed === null) {
            onCommit(null);
          } else {
            const rounded = roundCurrencyAmount(parsed);
            if (!hasValue || Math.abs(rounded - numericValue!) >= 0.005) onCommit(rounded);
          }
          setDirty(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {!disabled && source !== "none" && (
        <p className="text-[10px] text-slate-500" title={portfolioHint}>
          {source === "manual"
            ? "Manual entry"
            : asOfLabel
              ? `As of ${asOfLabel}`
              : "From portfolio"}
        </p>
      )}
      {!disabled && source === "none" && (
        <p className="text-[10px] text-amber-700">Upload MyPortfolio or enter amount</p>
      )}
    </div>
  );
}
