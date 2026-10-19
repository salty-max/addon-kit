// status.ts's and each.ts's pure parts (bun test).
import { describe, expect, test } from "bun:test";
import { parse, pick } from "./each";
import { attention, buildVersion, latestPerWorkflow, slugOf, type Repo, type Run } from "./status";

describe("status", () => {
  test("a GitHub remote, ssh or https", () => {
    expect(slugOf("git@github.com:salty-max/palaver.git")).toBe("salty-max/palaver");
    expect(slugOf("https://github.com/salty-max/wow-data")).toBe("salty-max/wow-data");
    expect(slugOf("https://example.com/x/y.git")).toBeUndefined();
  });

  test("each workflow's newest run", () => {
    const run = (workflow: string, conclusion: string, sha: string): Run => ({ workflow, status: "completed", conclusion, sha, at: "" });
    const latest = latestPerWorkflow([run("CI", "failure", "b"), run("Game data", "success", "b"), run("CI", "success", "a")]);
    expect(latest.map((r) => `${r.workflow} ${r.conclusion}`)).toEqual(["CI failure", "Game data success"]);
  });

  test("a test build's version from its name", () => {
    expect(buildVersion("Palaver-3a2cc22.zip", "Palaver")).toBe("3a2cc22");
    expect(buildVersion("Hearthtale-v0.12.5-2-ga46a554.zip", "Hearthtale")).toBe("v0.12.5-2-ga46a554");
    expect(buildVersion("SecondWind-v0.5.4.zip", "Second")).toBeUndefined();
    expect(buildVersion("Hearthtale.lua", "Hearthtale")).toBeUndefined();
    expect(buildVersion("ravenpost-v0.4.0-windows-x64.exe", "ravenpost")).toBe("v0.4.0");
  });

  test("what wants a hand", () => {
    const r: Repo = {
      name: "palaver",
      branch: "main",
      upstream: "origin/main",
      ahead: 2,
      behind: 0,
      dirty: 1,
      head: "",
      runs: [{ workflow: "CI", status: "completed", conclusion: "failure", sha: "1234567890", at: "" }],
      prs: [{ number: 8, title: "chore: players' facts" }],
      build: { file: "Palaver-x.zip", version: "x", state: "behind", behind: 1 },
    };
    expect(attention(r)).toEqual([
      "1 file uncommitted",
      "2 commits to push",
      "CI: failure (1234567)",
      "pull request #8 open: chore: players' facts",
      "test build Palaver-x.zip is 1 commit behind HEAD",
    ]);
    expect(attention({ ...r, ahead: 0, dirty: 0, runs: [], prs: [], build: undefined })).toEqual([]);
    expect(attention({ ...r, upstream: undefined, ahead: 0, dirty: 0, runs: [], prs: [], build: undefined })).toEqual([
      "no upstream (local only)",
    ]);
  });
});

describe("each", () => {
  const names = ["addon-kit", "keyring", "palaver", "wow-data"];
  const test_ = { addon: (n: string) => ["keyring", "palaver"].includes(n), kit: (n: string) => n === "palaver" };

  test("the command after --", () => {
    expect(parse(["--kit", "--", "bun", "run", "check"])).toMatchObject({ which: "kit", command: "bun run check" });
    expect(parse(["--kit"])).toBe("give the command after --");
    expect(parse(["--nope", "--", "x"])).toBe("unknown option --nope");
    expect(parse(["--only", "--", "x"])).toBe("--only takes folder names, a,b");
  });

  test("which repositories", () => {
    const o = (argv: string[]) => parse([...argv, "--", "x"]) as Exclude<ReturnType<typeof parse>, string>;
    expect(pick(names, o([]), test_)).toEqual(["keyring", "palaver"]);
    expect(pick(names, o(["--kit"]), test_)).toEqual(["palaver"]);
    expect(pick(names, o(["--all", "--skip", "wow-data"]), test_)).toEqual(["addon-kit", "keyring", "palaver"]);
    expect(pick(names, o(["--only", "wow-data,nope"]), test_)).toEqual(["wow-data"]);
  });
});
