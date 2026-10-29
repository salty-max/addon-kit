// The family's status extension: a test build's version from its file name (bun test).
import { describe, expect, test } from "bun:test";
import { buildVersion } from "./status-extras";

describe("status extension", () => {
  test("a test build's version from its name", () => {
    expect(buildVersion("Palaver-3a2cc22.zip", "Palaver")).toBe("3a2cc22");
    expect(buildVersion("Hearthtale-v0.12.5-2-ga46a554.zip", "Hearthtale")).toBe("v0.12.5-2-ga46a554");
    expect(buildVersion("SecondWind-v0.5.4.zip", "Second")).toBeUndefined();
    expect(buildVersion("Hearthtale.lua", "Hearthtale")).toBeUndefined();
    expect(buildVersion("ravenpost-v0.4.0-windows-x64.exe", "ravenpost")).toBe("v0.4.0");
  });

});
