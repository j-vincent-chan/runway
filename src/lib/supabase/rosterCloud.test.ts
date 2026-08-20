import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Employee } from "@/types";
import { applyRemoteRosterToSettings } from "@/lib/supabase/rosterCloud";

function emp(id = "e1"): Employee {
  return { id, name: "Ada Lovelace", appointmentPercent: 100, employeeId: "1001" };
}

describe("applyRemoteRosterToSettings", () => {
  it("merges offer letters and start dates without dropping local-only fields", () => {
    const local = {
      ...DEFAULT_SETTINGS,
      employeeProfiles: {
        "hr:1001": { photoUrl: "https://local/photo.jpg", startDate: "2024-01-15" },
      },
    };
    const next = applyRemoteRosterToSettings(
      local,
      [
        {
          personKey: "hr:1001",
          displayName: "Ada",
          photoUrl: "https://cloud/photo.jpg",
          startDate: null,
          endDate: null,
          personnelType: "dataManagement",
          planningScope: 50,
          hidden: null,
          alumni: null,
          offerLetter: {
            fileName: "offer.pdf",
            mimeType: "application/pdf",
            uploadedAt: "2026-08-01T00:00:00.000Z",
            fileUrl: "https://cloud/offer.pdf",
          },
        },
      ],
      [emp()]
    );
    expect(next.employeeProfiles?.["hr:1001"]?.photoUrl).toBe("https://cloud/photo.jpg");
    expect(next.employeeProfiles?.["hr:1001"]?.startDate).toBe("2024-01-15");
    expect(next.employeeProfiles?.e1?.offerLetter?.fileUrl).toBe("https://cloud/offer.pdf");
    expect(next.employeePersonnelTypes?.e1).toBe("dataManagement");
    expect(next.employeePlanningScope?.e1).toBe(50);
  });
});
