// usage.ts: the cost of a session read from transcripts (fixtures in a temp folder).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseline, commitCount, costOf, isCommit, family, line, projectDirs, sessionFiles, spend, spendOf, summarise, turns, units, zero } from "./usage";

let tmp: string;
beforeAll(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "usage-test-")));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const msg = (id: string, model: string, ts: string, u: Partial<Record<string, number>>, req = `r${id}`) =>
  JSON.stringify({ type: "assistant", timestamp: ts, requestId: req, message: { id, model, usage: u } });

describe("usage", () => {
  test("units: dollars at list price, the cache write at its rate", () => {
    const t = { in: 1e6, out: 1e6, cacheWrite: 2e6, cacheWrite1h: 1e6, cacheRead: 1e6, msgs: 1 };
    // opus: 4 + 20 + 0.2 + one million five-minute writes (5) + one million an hour (8)
    expect(units(t, "claude-opus-5-5")).toBeCloseTo(4 + 20 + 0.2 + 5 + 8);
    expect(units(t, "claude-sonnet-5-5")).toBeCloseTo(2 + 10 + 0.2 + 2.5 + 4);
    expect(units(t, "<synthetic>")).toBe(0);
    expect(family("claude-haiku-5-5")).toBe("haiku");
    expect(family("claude-mythos-5-1")).toBe("fable");
    expect(family("<synthetic>")).toBe("other");
  });

  test("isCommit: git commit segments only", () => {
    expect(isCommit("git -C yonder commit -qm x")).toBe(true);
    expect(isCommit("cd a && git add -A && git commit -qm x")).toBe(true);
    expect(isCommit("git commit --amend --no-edit")).toBe(false);
    expect(isCommit('cat <<E\ngit(repo, "commit", "-m")\nE')).toBe(false);
    expect(isCommit("git log --oneline | grep commit")).toBe(false);
    expect(isCommit("git -c user.name=t commit -qm x")).toBe(false);
  });

  test("commitCount: the git commit commands that did not fail", () => {
    const use = (id: string, command: string) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name: "Bash", input: { command } }] } });
    const res = (id: string, isError = false) => JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content: "x" }] } });
    expect(
      commitCount([
        use("1", "git -C yonder commit -qm 'feat: x'"),
        res("1"),
        use("2", "git commit -qm 'feat: y'"),
        res("2", true),
        use("3", "git log --oneline | grep commit"),
        res("3"),
        use("4", "git add -A && git commit -qm z"),
        res("4"),
        res("9"),
      ]),
    ).toBe(2);
  });

  test("turns: each message once, noise skipped", () => {
    const seen = new Set<string>();
    const lines = [
      msg("a", "claude-opus-5-5", "2026-10-25T10:00:00Z", { output_tokens: 10, cache_read_input_tokens: 100 }),
      msg("a", "claude-opus-5-5", "2026-10-25T10:00:01Z", { output_tokens: 10, cache_read_input_tokens: 100 }),
      "not json with \"usage\"",
      JSON.stringify({ type: "user", message: { content: "hi" } }),
      msg("b", "claude-opus-5-5", "2026-10-25T10:01:00Z", { input_tokens: 5 }),
    ];
    const got = turns(lines, seen);
    expect(got.map((t) => t.id)).toEqual(["a|ra", "b|rb"]);
    expect(got[0]!.tally).toEqual({ in: 0, out: 10, cacheWrite: 0, cacheWrite1h: 0, cacheRead: 100, msgs: 1 });
    // a second file of the same session, the same message: not counted again
    expect(turns([lines[0]!], seen)).toEqual([]);
  });

  test("a session: its main file, its helpers by type, the cache", () => {
    const projects = join(tmp, "config", "projects");
    const root = join(tmp, "family");
    const dir = join(projects, root.replace(/[/.]/g, "-"));
    const wt = join(projects, root.replace(/[/.]/g, "-") + "--claude-worktrees-x");
    mkdirSync(join(dir, "s1", "subagents"), { recursive: true });
    mkdirSync(wt, { recursive: true });
    mkdirSync(join(projects, "-elsewhere"), { recursive: true });
    writeFileSync(
      join(dir, "s1.jsonl"),
      [msg("m1", "claude-sonnet-5-5", "2026-10-25T10:00:00Z", { output_tokens: 100, cache_read_input_tokens: 10_000 }), msg("m2", "claude-sonnet-5-5", "2026-10-25T10:30:00Z", { output_tokens: 100, cache_read_input_tokens: 30_000 })].join("\n"),
    );
    writeFileSync(join(dir, "s1", "subagents", "agent-x.jsonl"), msg("h1", "claude-opus-5-5", "2026-10-25T10:10:00Z", { output_tokens: 50 }));
    writeFileSync(join(dir, "s1", "subagents", "agent-x.meta.json"), JSON.stringify({ agentType: "reviewer" }));

    expect(projectDirs(root, join(tmp, "config"))).toEqual([dir, wt]);
    const files = sessionFiles([dir], "s1");
    expect(files.map((f) => f.kind)).toEqual(["main", "helper:reviewer"]);
    expect(sessionFiles([dir], "nope")).toEqual([]);

    const s = spend(files)!;
    expect(s.turns).toBe(2);
    expect(s.contextPerTurn).toBe(20_000);
    expect(s.first).toBe("2026-10-25T10:00:00Z");
    expect(s.last).toBe("2026-10-25T10:30:00Z");
    expect(s.helpers).toEqual({ reviewer: 1 });
    expect(s.by.main).toBeCloseTo(0.01);
    expect(s.by["helper:reviewer"]).toBeCloseTo(0.001);
    expect(Object.keys(s.models).sort()).toEqual(["opus", "sonnet"]);

    const cache = join(tmp, "cache");
    expect(spendOf([dir], "s1", cache)!.units).toBeCloseTo(s.units);
    // the cached copy is served until a transcript changes
    writeFileSync(join(cache, "s1.json"), JSON.stringify({ key: JSON.parse(readFileSync(join(cache, "s1.json"), "utf8")).key, spend: { ...s, units: 7 } }));
    expect(spendOf([dir], "s1", cache)!.units).toBe(7);
    writeFileSync(join(dir, "s1.jsonl"), msg("m9", "claude-opus-5-5", "2026-10-25T11:00:00Z", { output_tokens: 1 }));
    expect(spendOf([dir], "s1", cache)!.units).toBeCloseTo(0.00102);
    expect(spendOf([dir], "ghost", cache)).toBeUndefined();
    expect(spend([])).toBeUndefined();
  });

  test("a card's cost: the session's commits, several cards sharing it", () => {
    const sp = { by: { main: 9, "helper:reviewer": 1 }, models: { opus: zero() }, units: 10, first: "2026-10-25T10:00:00Z", last: "2026-10-25T10:30:00Z", turns: 4, contextPerTurn: 50_000, helpers: { reviewer: 1 }, commits: 4 };
    const cards = [
      { id: "a", title: "One", status: "done", repos: ["r"], repo: "r", session: "s" },
      { id: "b", title: "Two", status: "done", repos: ["r"], repo: "r", session: "s" },
    ] as any;
    const c = costOf(cards, sp);
    expect(c.commits).toBe(4);
    expect(c.unitsPerCommit).toBe(2.5);
    expect(c.helperShare).toBeCloseTo(0.1);
    expect(c.cards).toBe(2);
    expect(c.status).toBe("done");
    expect(costOf([{ ...cards[0], status: "running" }, cards[1]], sp).status).toBe("running");

    const sum = summarise([c, { ...c, session: "t", cards: 1, units: 8, commits: 4, unitsPerCommit: 2 }], [sp as any], ["lost"], "2026-10-25T20:00:00Z");
    expect(sum).toMatchObject({ sessions: 2, cards: 3, done: 3, commits: 8 });
    // (per card: 5, 5 and 8)
    expect(sum.medianUnitsPerDoneCard).toBe(5);
    expect(line(sum)).toContain("2 sessions, 3 cards (3 done)");
    expect(baseline([c], sum)).toContain("# Usage baseline, 2026-10-25");
  });
});
