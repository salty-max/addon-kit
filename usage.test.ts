// usage.ts: the cost of a session read from transcripts (fixtures in a temp folder).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseline, costOf, family, line, projectDirs, sessionFiles, spend, spendOf, summarise, turns, units, zero } from "./usage";

let tmp: string;
beforeAll(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "usage-test-")));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const msg = (id: string, model: string, ts: string, u: Partial<Record<string, number>>, req = `r${id}`) =>
  JSON.stringify({ type: "assistant", timestamp: ts, requestId: req, message: { id, model, usage: u } });

describe("usage", () => {
  test("units: the price ratios, then the model family's factor", () => {
    const t = { in: 1000, out: 1000, cacheWrite: 1000, cacheRead: 1000, msgs: 1 };
    expect(units(t, "claude-opus-5-5")).toBe(1000 + 5000 + 1250 + 100);
    expect(units(t, "claude-sonnet-5-5")).toBeCloseTo(7350 * 0.2);
    expect(family("claude-haiku-5-5")).toBe("haiku");
    expect(family("<synthetic>")).toBe("other");
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
    expect(got[0]!.tally).toEqual({ in: 0, out: 10, cacheWrite: 0, cacheRead: 100, msgs: 1 });
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
    expect(s.by.main).toBeCloseTo(((100 * 5 + 10_000 * 0.1) + (100 * 5 + 30_000 * 0.1)) * 0.2);
    expect(s.by["helper:reviewer"]).toBe(250);
    expect(Object.keys(s.models).sort()).toEqual(["opus", "sonnet"]);

    const cache = join(tmp, "cache");
    expect(spendOf([dir], "s1", cache)!.units).toBeCloseTo(s.units);
    // the cached copy is served until a transcript changes
    writeFileSync(join(cache, "s1.json"), JSON.stringify({ key: JSON.parse(readFileSync(join(cache, "s1.json"), "utf8")).key, spend: { ...s, units: 7 } }));
    expect(spendOf([dir], "s1", cache)!.units).toBe(7);
    writeFileSync(join(dir, "s1.jsonl"), msg("m9", "claude-opus-5-5", "2026-10-25T11:00:00Z", { output_tokens: 1 }));
    expect(spendOf([dir], "s1", cache)!.units).toBe(255);
    expect(spendOf([dir], "ghost", cache)).toBeUndefined();
    expect(spend([])).toBeUndefined();
  });

  test("a card's cost: commits in its window, a session of several cards shared", () => {
    const root = join(tmp, "fam2");
    const repo = join(root, "r");
    mkdirSync(repo, { recursive: true });
    const git = (...a: string[]) => Bun.spawnSync(["git", ...a], { cwd: repo, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
    git("init", "-q");
    for (const [i, at] of ["2026-10-25T10:05:00Z", "2026-10-25T10:20:00Z", "2026-10-25T12:00:00Z"].entries()) {
      writeFileSync(join(repo, `f${i}`), "x");
      git("add", ".");
      Bun.spawnSync(["git", "commit", "-qm", `c${i}`, "--date", at], { cwd: repo, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@e", GIT_COMMITTER_DATE: at } });
    }
    const sp = { by: { main: 900, "helper:reviewer": 100 }, models: { opus: zero() }, units: 1000, first: "2026-10-25T10:00:00Z", last: "2026-10-25T10:30:00Z", turns: 4, contextPerTurn: 50_000, helpers: { reviewer: 1 } };
    const cards = [
      { id: "a", title: "One", status: "done", repos: ["r"], repo: "r", session: "s" },
      { id: "b", title: "Two", status: "done", repos: ["r"], repo: "r", session: "s" },
    ] as any;
    const c = costOf(cards, sp, root);
    expect(c.commits).toBe(2);
    expect(c.unitsPerCommit).toBe(500);
    expect(c.helperShare).toBeCloseTo(0.1);
    expect(c.cards).toBe(2);
    expect(c.status).toBe("done");
    expect(costOf([{ ...cards[0], status: "running" }, cards[1]], sp, root).status).toBe("running");

    const sum = summarise([c, { ...c, session: "t", cards: 1, units: 4_000_000, commits: 4, unitsPerCommit: 1e6 }], [sp as any], ["lost"], "2026-10-25T20:00:00Z");
    expect(sum).toMatchObject({ sessions: 2, cards: 3, done: 3, commits: 6 });
    // (per card: 500, 500 and 4,000,000)
    expect(sum.medianUnitsPerDoneCard).toBe(500);
    expect(line(sum)).toContain("2 sessions, 3 cards (3 done)");
    expect(baseline([c], sum)).toContain("# Usage baseline, 2026-10-25");
  });
});
