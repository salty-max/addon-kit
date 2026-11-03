// Launch night's dashboard (launch.ts, launch-rules.ts): its rules, its state file,
// its server's refusals and the made-up view. Nothing is read from the network. bun test
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engine, demoCells, handler, loadContent, view, type Deps } from "./launch";
import * as r from "./launch-rules";

const row = (mark: string, label: string, text = "x") => ({ mark, label, text });

describe("readiness", () => {
  test("only launch rows count: languages and the review don't", () => {
    expect(r.readiness([row("✓", "git"), row("!", "deDE"), row("!", "review"), row("!", "cold read")]).light).toBe("green");
  });
  test("a ✗ on interface, CI, game data, version or git is red", () => {
    for (const label of ["interface", "CI", "game data", "version", "git"]) expect(r.readiness([row("✗", label)]).light).toBe("red");
  });
  test("a stale zip, a missing store id or a ✗ elsewhere is amber", () => {
    expect(r.readiness([row("!", "test zip")]).light).toBe("amber");
    expect(r.readiness([row("✗", "store ids")]).light).toBe("amber");
  });
});

describe("in game", () => {
  const ids = ["a", "b"];
  test("none ticked is grey, some amber, all ok green, any broken red", () => {
    expect(r.inGame("x", ids, {}).light).toBe("grey");
    expect(r.inGame("x", ids, { "x/a": "ok" }).light).toBe("amber");
    expect(r.inGame("x", ids, { "x/a": "ok", "x/b": "ok" }).light).toBe("green");
    expect(r.inGame("x", ids, { "x/a": "ok", "x/b": "broken" }).light).toBe("red");
  });
});

describe("the Forever build", () => {
  test("latest.ts's line, both forms", () => {
    expect(r.parseBuild("- forever: wowf 1.60.1.70707 → **1.60.1.70753**\n")).toEqual({ pin: "1.60.1.70707", latest: "1.60.1.70753" });
    expect(r.parseBuild("- forever: wowf 1.60.1.70707, the latest\n")).toEqual({ pin: "1.60.1.70707", latest: "1.60.1.70707" });
    expect(r.parseBuild("nothing")).toBeUndefined();
  });
  test("interface from a build", () => {
    expect(r.interfaceFor("1.60.1.70707")).toBe(16001);
    expect(r.interfaceFor("1.15.9.70576")).toBe(11509);
  });
  test("same version newer build is amber, a new version is red", () => {
    expect(r.buildLight({ pin: "1.60.1.1", latest: "1.60.1.1" }, 16001).light).toBe("green");
    expect(r.buildLight({ pin: "1.60.1.1", latest: "1.60.1.2" }, 16001).light).toBe("amber");
    expect(r.buildLight({ pin: "1.60.1.1", latest: "1.60.2.1" }, 16001).light).toBe("red");
    expect(r.buildLight(undefined, 16001).light).toBe("amber");
  });
});

describe("the other lights", () => {
  test("data chain: a running job amber, a failure red, a waiting PR red after the check time", () => {
    const ok = { workflow: "CI", status: "completed", conclusion: "success" };
    expect(r.chain([{ name: "a", runs: [ok], prs: [] }], 0, 10).light).toBe("green");
    expect(r.chain([{ name: "a", runs: [{ ...ok, status: "in_progress" }], prs: [] }], 0, 10).light).toBe("amber");
    expect(r.chain([{ name: "a", runs: [{ ...ok, conclusion: "failure" }], prs: [] }], 0, 10).light).toBe("red");
    const pr = [{ number: 1, title: "t" }];
    expect(r.chain([{ name: "a", runs: [], prs: pr }], 0, 10).light).toBe("amber");
    expect(r.chain([{ name: "a", runs: [], prs: pr }], 11, 10).light).toBe("red");
  });
  test("infra: slow is amber, down red", () => {
    const p = { name: "s", url: "", status: 200, ms: 100 };
    expect(r.infra([p]).light).toBe("green");
    expect(r.infra([{ ...p, ms: 4000 }]).light).toBe("amber");
    expect(r.infra([{ ...p, status: 503 }]).light).toBe("red");
    expect(r.infra([{ ...p, status: 0, error: "refused" }]).light).toBe("red");
  });
  test("board: only cards on a launch repository; blocked is red", () => {
    const repos = new Set(["yonder"]);
    expect(r.board([{ id: "1", title: "t", status: "blocked", repos: ["other"] }], repos).light).toBe("green");
    expect(r.board([{ id: "1", title: "t", status: "waiting-test", repos: ["yonder"] }], repos).light).toBe("amber");
    expect(r.board([{ id: "1", title: "t", status: "blocked", repos: ["yonder"] }], repos).light).toBe("red");
  });
  test("a skipped or cancelled run is fine, a repo gh gave nothing for is grey, not green", () => {
    const run = (conclusion: string) => ({ workflow: "CI", status: "completed", conclusion });
    expect(r.chain([{ name: "a", runs: [run("skipped"), run("cancelled")], prs: [] }], 0, 10).light).toBe("green");
    expect(r.chain([{ name: "a" }], 0, 10).light).toBe("grey");
    expect(r.worst("green", "grey")).toBe("grey");
    expect(r.worst("grey", "amber")).toBe("amber");
  });
});

describe("changes from the page are checked, never trusted", () => {
  const s0 = r.emptyState();
  test("ticks", () => {
    const s = r.apply(s0, { op: "tick", key: "yonder/tab", value: "broken" }) as r.State;
    expect(s.ticks["yonder/tab"]).toBe("broken");
    expect((r.apply(s, { op: "tick", key: "yonder/tab", value: "untested" }) as r.State).ticks).toEqual({});
    for (const bad of [{ key: "../x", value: "ok" }, { key: "a/b", value: "fine" }, { key: 3, value: "ok" }]) expect(typeof r.apply(s0, { op: "tick", ...bad })).toBe("string");
  });
  test("notes need an addon, a severity and text, and are cut to size", () => {
    expect(typeof r.apply(s0, { op: "note", addon: "x", severity: "bug", text: "  " })).toBe("string");
    expect(typeof r.apply(s0, { op: "note", addon: "x", severity: "huge", text: "t" })).toBe("string");
    const s = r.apply(s0, { op: "note", addon: "x", severity: "bug", text: "y".repeat(5000), shot: "a.png" }) as r.State;
    expect(s.notes[0].text.length).toBe(2000);
    expect(s.notes[0].shot).toBe("a.png");
    expect((r.apply(s, { op: "drop", id: s.notes[0].id }) as r.State).notes).toEqual([]);
  });
  test("steps, answers, and an unknown op", () => {
    expect((r.apply(s0, { op: "step", id: "t", done: true }) as r.State).steps).toEqual({ t: true });
    expect((r.apply(s0, { op: "answer", id: "q", done: true, text: "1.60.1" }) as r.State).answers.q).toEqual({ done: true, text: "1.60.1" });
    expect(typeof r.apply(s0, { op: "rm -rf" })).toBe("string");
  });
  test("the state file survives a restart, and a broken file is an empty state", () => {
    const file = join(mkdtempSync(join(tmpdir(), "launch-")), "sub", "state.json");
    expect(r.readState(file)).toEqual(r.emptyState());
    const s = r.apply(s0, { op: "tick", key: "keyring/drawer", value: "broken" }) as r.State;
    r.writeState(file, s);
    expect(r.readState(file).ticks).toEqual({ "keyring/drawer": "broken" });
    Bun.write(file, "{ not json");
    expect(r.readState(file)).toEqual(r.emptyState());
  });
});

describe("the content and the view", () => {
  const content = loadContent();
  test("nine addons, ranked 1 to 9, every check with its words", () => {
    expect(content.addons.map((a) => a.rank).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const a of content.addons) {
      expect(a.checks.length).toBeGreaterThan(0);
      for (const c of a.checks) for (const k of ["id", "look", "ok", "todo", "fix"] as const) expect(c[k].length).toBeGreaterThan(0);
    }
  });
  test("no semicolons in what the user reads", () => {
    expect(readFileSync(join(import.meta.dir, "launch-night.json"), "utf8")).not.toContain(";");
  });
  test("the made-up view names a red addon, an amber build, and draws every panel", () => {
    const v = view(content, demoCells(content, Date.parse(content.launch) - 3600_000), r.emptyState(), []);
    expect(v.overall).toBe("red");
    expect(v.addons.find((a) => a.id === "keyring")?.light).toBe("red");
    expect(v.build.light).toBe("amber");
    expect(v.addons).toHaveLength(9);
    expect(v.timeline.filter((t) => t.next)).toHaveLength(1);
  });
  test("with nothing read yet it says so, never throws, and is not green", () => {
    const v = view(content, {}, r.emptyState(), []);
    expect(v.addons[0].readiness.light).toBe("grey");
    expect(v.addons[0].light).toBe("grey");
    expect(v.build.light).toBe("amber");
    expect(v.overall).not.toBe("green");
  });
  test("a failed reading is amber on old data, never a green that hides it, and the screenshots don't count", () => {
    const green = demoCells(content);
    green.remote = { at: 0, ms: 0, data: content.addons.map((a) => ({ name: a.id, ahead: 0, behind: 0, dirty: 0, head: "x", runs: [], prs: [] })) };
    green.preflight = { at: 0, ms: 0, data: [] };
    expect(view(content, green, r.emptyState(), []).sources.light).toBe("green");
    green.shots = { ...green.shots, error: "EPERM: iCloud Drive's root can't be read from here" };
    expect(view(content, green, r.emptyState(), []).sources.light).toBe("green");
    green.remote = { ...green.remote, error: "gave up after 150 s" };
    const v = view(content, green, r.emptyState(), []);
    expect(v.sources.light).toBe("amber");
    expect(v.sources.reasons).toEqual(["remote failed: gave up after 150 s"]);
    expect(v.overall).not.toBe("green");
    // (a reading that never answered is grey where it feeds a light, not a second amber)
    green.data = { at: 0, ms: 0, error: "forever.db not built" };
    expect(view(content, { ...green, remote: demoCells(content).remote }, r.emptyState(), []).sources.light).toBe("green");
  });
  test("a status answer with no runs or pull requests (gh failed) draws, it does not throw", () => {
    const cells = demoCells(content);
    cells.remote = { at: 0, ms: 0, data: content.addons.map((a) => ({ name: a.id, ahead: 0, behind: 0, dirty: 0, head: "x" })) };
    const v = view(content, cells, r.emptyState(), []);
    expect(v.chain.light).toBe("grey");
    expect(v.addons).toHaveLength(9);
  });
});

describe("the server", () => {
  const PORT = 4191;
  const KEY = "k3y";
  const calls: string[][] = [];
  const dir = mkdtempSync(join(tmpdir(), "launch-srv-"));
  const content = loadContent();
  const engine = new Engine({});
  engine.cells = demoCells(content);
  const deps: Deps = { content, engine, stateFile: join(dir, "s.json"), shotsDir: dir, exec: async (cmd) => (calls.push(cmd), { out: "ok", code: 0 }) };
  const h = handler(deps, KEY, PORT);
  const ask = (path: string, init: { host?: string; key?: string; body?: unknown; method?: string } = {}) =>
    h(new Request(`http://127.0.0.1:${PORT}${path}`, { method: init.method ?? "POST", headers: { host: init.host ?? `127.0.0.1:${PORT}`, ...(init.key !== undefined ? { "x-launch-key": init.key } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined }));

  test("another Host and a missing key are refused", async () => {
    expect((await ask("/", { method: "GET", host: "evil.test" })).status).toBe(403);
    expect((await ask("/api/state", { method: "GET" })).status).toBe(403);
    expect((await ask("/api/change", { key: "wrong", body: {} })).status).toBe(403);
    expect((await ask("/shot?f=x.png", { method: "GET" })).status).toBe(403);
  });
  test("the page is never framed and carries the key", async () => {
    const res = await ask("/", { method: "GET" });
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(await res.text()).toContain(`const KEY="${KEY}"`);
  });
  test("a tick is saved and comes back in the state", async () => {
    expect((await ask("/api/change", { key: KEY, body: { op: "tick", key: "keyring/drawer", value: "broken" } })).status).toBe(200);
    const v = (await (await ask("/api/state", { method: "GET", key: KEY })).json()) as { addons: { id: string; light: string }[] };
    expect(v.addons.find((a) => a.id === "keyring")?.light).toBe("red");
    expect((await ask("/api/change", { key: KEY, body: { op: "tick", key: "bad", value: "ok" } })).status).toBe(400);
  });
  test("only the harmless actions run, on known addons and statuses", async () => {
    expect((await ask("/api/action", { key: KEY, body: { name: "store-dry", repo: "yonder" } })).status).toBe(200);
    expect(calls.at(-1)).toEqual(["bun", "addon-kit/store.ts", "yonder"]);
    for (const body of [{ name: "store-dry", repo: "../../x" }, { name: "card", id: "a b", status: "done" }, { name: "card", id: "a", status: "pushed" }, { name: "push" }, { name: "release" }]) {
      const n = calls.length;
      expect((await ask("/api/action", { key: KEY, body })).status).toBe(400);
      expect(calls.length).toBe(n);
    }
  });
  test("a screenshot is served only if the engine listed it, never by a path", async () => {
    engine.cells.shots = { at: 0, ms: 0, data: [{ name: "a.png", mtime: 1 }] };
    Bun.write(join(dir, "a.png"), "png");
    Bun.write(join(dir, "secret.txt"), "no");
    expect((await ask(`/shot?k=${KEY}&f=a.png`, { method: "GET" })).status).toBe(200);
    expect((await ask(`/shot?k=${KEY}&f=secret.txt`, { method: "GET" })).status).toBe(404);
    expect((await ask(`/shot?k=${KEY}&f=../a.png`, { method: "GET" })).status).toBe(404);
  });
});
