import { describe, expect, it } from "vitest";
import { resolveTheme } from "./ThemeContext";

describe("resolveTheme", () => {
  it("restores valid user preferences and falls back safely for absent or invalid values", () => {
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme(null, "light")).toBe("light");
    expect(resolveTheme("system", "dark")).toBe("dark");
  });
});
