import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseDateParameters,
  parseNetPositionWorkbook,
  splitCodeDescription,
} from "@/lib/parsers/netPositionParser";
import { buildNetPositionAccountSeries } from "@/lib/net-position/buildAccountSeries";

const SAMPLE = resolve(
  process.cwd(),
  "financial-reports/26-08 Net Position Report-15749116.xlsx"
);

describe("netPositionParser helpers", () => {
  it("splits code and description", () => {
    expect(splitCodeDescription("7000 - Private Restricted Gifts")).toEqual({
      code: "7000",
      description: "Private Restricted Gifts",
    });
    expect(splitCodeDescription("136092L")).toEqual({ code: "136092L" });
  });

  it("parses date parameters", () => {
    expect(parseDateParameters("Jul 2026 - Aug 2026")).toEqual({
      periodStart: "2026-07",
      periodEnd: "2026-08",
    });
  });
});

describe("parseNetPositionWorkbook", () => {
  it("parses the sample Net Position report", () => {
    const wb = XLSX.read(readFileSync(SAMPLE), { type: "buffer", cellDates: true });
    const { import: imp, warnings } = parseNetPositionWorkbook(
      wb,
      "26-08 Net Position Report-15749116.xlsx"
    );

    expect(warnings.filter((w) => w.severity === "error")).toHaveLength(0);
    expect(imp.rows.length).toBe(23);
    expect(imp.periodStart).toBe("2026-07");
    expect(imp.periodEnd).toBe("2026-08");
    expect(imp.reportRunDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const sandbox = imp.rows.find((r) => r.project === "7030722");
    expect(sandbox).toBeTruthy();
    expect(sandbox!.accountKey).toBe("7000-129074-7030722");
    expect(sandbox!.endingBalance).toBe(51974.67);
    expect(sandbox!.projectDescription).toBe("Sandbox");

    const deficit = imp.rows.find((r) => r.project === "136092L");
    expect(deficit!.endingBalance).toBe(-135602.8);

    const series = buildNetPositionAccountSeries([imp]);
    expect(series).toHaveLength(23);
    expect(series[0]!.latest.endingBalance).toBeGreaterThanOrEqual(
      series[series.length - 1]!.latest.endingBalance
    );
  });
});
