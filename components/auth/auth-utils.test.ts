import { describe, expect, it } from "vitest";

import {
  buildAuthHref,
  firstQueryValue,
  getAuthErrorMessage,
  safeRedirectPath,
} from "./auth-utils";

describe("auth route helpers", () => {
  it("keeps only same-origin relative redirects", () => {
    expect(safeRedirectPath("/groups/beijing?tab=balance")).toBe(
      "/groups/beijing?tab=balance",
    );
    expect(safeRedirectPath("https://example.com")).toBe("/");
    expect(safeRedirectPath("//example.com")).toBe("/");
    expect(safeRedirectPath("/\\example.com")).toBe("/");
  });

  it("reads the first query value and preserves safe auth context", () => {
    expect(firstQueryValue(["first", "second"])).toBe("first");
    expect(
      buildAuthHref("/join", {
        email: "ami@example.com",
        nextPath: "/?scope=group",
        token: "private-token",
      }),
    ).toBe(
      "/join?email=ami%40example.com&next=%2F%3Fscope%3Dgroup&token=private-token",
    );
  });

  it("does not expose raw sign-in provider errors", () => {
    expect(
      getAuthErrorMessage(
        { status: 401, message: "User with that email does not exist" },
        "sign-in",
      ),
    ).toBe("Email ou mot de passe incorrect.");
  });

  it("distinguishes a network failure from invalid credentials", () => {
    expect(getAuthErrorMessage(new TypeError("Failed to fetch"), "sign-in")).toContain(
      "Vérifie ta connexion",
    );
  });

  it("explains private sign-up failures", () => {
    expect(
      getAuthErrorMessage(
        { status: 403, code: "INVITATION_REQUIRED" },
        "sign-up",
      ),
    ).toContain("lien d’invitation");
  });
});
