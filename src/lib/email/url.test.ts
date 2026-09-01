import { afterEach, describe, expect, it } from "vitest";
import { appUrlFromEnv, normalizeAppUrl } from "./url";

describe("normalizeAppUrl", () => {
  it("prepends https:// to a schemeless origin", () => {
    expect(normalizeAppUrl("ucsf-runway.vercel.app")).toBe("https://ucsf-runway.vercel.app");
  });

  it("preserves existing schemes", () => {
    expect(normalizeAppUrl("https://runway.example.org")).toBe("https://runway.example.org");
    expect(normalizeAppUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("strips trailing slashes", () => {
    expect(normalizeAppUrl("https://runway.example.org/")).toBe("https://runway.example.org");
    expect(normalizeAppUrl("runway.example.org//")).toBe("https://runway.example.org");
  });

  it("returns null for empty or missing values", () => {
    expect(normalizeAppUrl("")).toBeNull();
    expect(normalizeAppUrl("   ")).toBeNull();
    expect(normalizeAppUrl(undefined)).toBeNull();
    expect(normalizeAppUrl(null)).toBeNull();
  });
});

describe("appUrlFromEnv", () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("normalizes the env value", () => {
    process.env.NEXT_PUBLIC_APP_URL = "ucsf-runway.vercel.app";
    expect(appUrlFromEnv()).toBe("https://ucsf-runway.vercel.app");
  });

  it("falls back when unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(appUrlFromEnv()).toBe("https://runway.vercel.app");
  });
});
