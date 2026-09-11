import { describe, expect, it } from "vitest";
import { buildChartstringCsv, chartstringCsvFilename } from "./chartstringCsv";

function lines(csv: string): string[] {
  return csv.replace(/^\uFEFF/, "").trimEnd().split("\r\n");
}

describe("buildChartstringCsv", () => {
  it("leads with Person on people-grouped pages and repeats a shared account per person", () => {
    const csv = buildChartstringCsv(
      [
        { person: "Shauna Kaiser", account: "HZNP-HZN-825-303", chartstring: "4400-138401-141228A-44" },
        { person: "Sheyla F Yamato", account: "HZNP-HZN-825-303", chartstring: "4400-138401-141228A-44" },
      ],
      { withPerson: true }
    );
    expect(lines(csv)).toEqual([
      "Person,Account,Chartstring,Fund,Dept ID,Project Number,Activity Code",
      "Shauna Kaiser,HZNP-HZN-825-303,4400-138401-141228A-44,4400,138401,141228A,44",
      "Sheyla F Yamato,HZNP-HZN-825-303,4400-138401-141228A-44,4400,138401,141228A,44",
    ]);
  });

  it("omits Person on Account Balances and leaves Activity Code blank for a 3-segment key", () => {
    const csv = buildChartstringCsv(
      [{ account: "ORV-PF-01 Cough", chartstring: "4400-138401-141004A" }],
      { withPerson: false }
    );
    expect(lines(csv)).toEqual([
      "Account,Chartstring,Fund,Dept ID,Project Number,Activity Code",
      "ORV-PF-01 Cough,4400-138401-141004A,4400,138401,141004A,",
    ]);
  });

  it("quotes an account name that carries a comma and blanks the codes for a label-only source", () => {
    const csv = buildChartstringCsv(
      [
        { person: "A", account: "24-41571: A Randomized, Double", chartstring: "4400-138401-144880A-44" },
        { person: "A", account: "Percent effort other", chartstring: "Percent effort other" },
      ],
      { withPerson: true }
    );
    expect(lines(csv).slice(1)).toEqual([
      'A,"24-41571: A Randomized, Double",4400-138401-144880A-44,4400,138401,144880A,44',
      "A,Percent effort other,Percent effort other,,,,",
    ]);
  });
});

describe("chartstringCsvFilename", () => {
  it("names the page and zero-pads the date", () => {
    expect(chartstringCsvFilename("account-balances", new Date(2026, 8, 3))).toBe(
      "account-balances-chartstrings-2026-09-03.csv"
    );
  });
});
