// status.ts's, each.ts's and secret.ts's pure parts (bun test).
import { describe, expect, test } from "bun:test";
import { parse, pick } from "./each";
import { unfit, users } from "./secret";
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

describe("secret", () => {
  test("a value fit for its secret", () => {
    const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(unfit("CURSEFORGE_TOKEN", uuid)).toBeUndefined();
    expect(unfit("CURSEFORGE_TOKEN", "abcdefghijklmnopqrstuvwxyz")).toBe("a CurseForge token is a UUID, this isn't one");
    expect(unfit("WAGO_API_TOKEN", uuid)).toBe("this is a UUID: CurseForge's token, not Wago's");
    expect(unfit("WAGO_API_TOKEN", "a".repeat(40))).toBeUndefined();
    expect(unfit("WAGO_API_TOKEN", "")).toBe("it is empty");
    expect(unfit("WAGO_API_TOKEN", "two words here and more")).toBe("it holds a space or a line break: not a token");
    expect(unfit("INBOX_EVENTS_TOKEN", "short")).toBe("5 characters: too short for a token");
  });

  test("the repositories that read it", () => {
    const workflows = {
      keyring: ["CF_API_KEY: ${{ secrets.CURSEFORGE_TOKEN }}\nWAGO_API_TOKEN: ${{ secrets.WAGO_API_TOKEN }}"],
      palaver: ["jobs:\n  data:\n    uses: salty-max/wow-data/.github/workflows/addon-data.yml@main\n    secrets: inherit\n"],
      ravenpost: ["name: CI\n"],
    };
    expect(users("WAGO_API_TOKEN", workflows)).toEqual(["keyring"]);
    // (wow-data's addon-data.yml, beside the kit, reads INBOX_EVENTS_TOKEN)
    expect(users("INBOX_EVENTS_TOKEN", workflows)).toEqual(["palaver"]);
    expect(users("NOTHING_READS_THIS", workflows)).toEqual([]);
  });
});
