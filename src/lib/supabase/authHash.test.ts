import { describe, expect, it } from "vitest";
import { parseAuthHashError } from "./authHash";

describe("parseAuthHashError", () => {
  it("returns null for an empty hash", () => {
    expect(parseAuthHashError("")).toBeNull();
    expect(parseAuthHashError("#")).toBeNull();
  });

  it("returns null for a success token hash", () => {
    expect(
      parseAuthHashError("#access_token=abc&refresh_token=def&token_type=bearer")
    ).toBeNull();
  });

  it("parses an expired-link error hash", () => {
    expect(
      parseAuthHashError(
        "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"
      )
    ).toEqual({
      code: "otp_expired",
      description: "Email link is invalid or has expired",
    });
  });

  it("accepts a hash without the leading #", () => {
    expect(parseAuthHashError("error=access_denied&error_code=otp_expired")).toEqual({
      code: "otp_expired",
      description: null,
    });
  });

  it("returns null fields for an error hash missing details", () => {
    expect(parseAuthHashError("#error=server_error")).toEqual({
      code: null,
      description: null,
    });
  });

  it("returns null for a malformed hash with no error param", () => {
    expect(parseAuthHashError("#not-even-params")).toBeNull();
  });
});
