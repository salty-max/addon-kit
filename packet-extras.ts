/**
 * The family's extension to harness/packet.ts: for Yonder's riddle files, the
 * lookup cards (wow-data's bin/card.ts) of the subjects of the riddles the
 * change touches, for each game the riddle's file is for. harness.toml's
 * [extensions] packet names this file; packet.ts calls extras().
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PacketContext } from "./packet";

const MAX_CARDS = 24;

// ── Yonder's riddles, pure (harness.test.ts) ────────────────────────────────
export type Game = "classic" | "forever";
export type Subject = { kind: "npc" | "object" | "place"; arg: string };
export type Riddle = { id: string; spans: [number, number][]; subjects: Subject[]; landmark?: string };

// A riddle file's riddles: each one's lines (its front matter entry and its
// prose section, 1-based, inclusive) and the subjects the cards are for.
export function riddles(text: string): { games: Game[]; list: Riddle[] } {
  const lines = text.split("\n");
  const byId = new Map<string, Riddle>();
  const get = (id: string) => byId.get(id) ?? byId.set(id, { id, spans: [], subjects: [] }).get(id)!;
  let games: Game[] = ["classic"];
  let cur: Riddle | undefined;
  let start = 0;
  const close = (end: number) => {
    if (cur) cur.spans.push([start, end]);
    cur = undefined;
  };
  const add = (r: Riddle, kind: Subject["kind"], arg: string) => {
    if (!r.subjects.some((s) => s.kind === kind && s.arg === arg)) r.subjects.push({ kind, arg });
  };
  const fmEnd = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const l = lines[i];
    if (i <= fmEnd) {
      const client = l.match(/^client:\s*(\w+)/)?.[1];
      if (client) games = client === "both" ? ["classic", "forever"] : client === "forever" ? ["forever"] : ["classic"];
      const riddle = l.match(/^\s{2}- id:\s*([\w-]+)/);
      if (riddle || /^\S/.test(l)) close(n - 1);
      if (riddle) [cur, start] = [get(riddle[1]), n];
      else if (/^quarry:/.test(l)) [cur, start] = [get("quarry"), n];
      if (!cur) continue;
      const v = l.replace(/\s+#.*$/, "");
      let m: RegExpMatchArray | null;
      if ((m = v.match(/^\s+object:\s*(\d+)\s*$/))) add(cur, "object", m[1]);
      else if ((m = v.match(/^\s+creature:\s*(\d+)\s*$/))) add(cur, "npc", m[1]);
      else if ((m = v.match(/^\s+area:\s*(.+?)\s*$/))) add(cur, "place", m[1].replace(/^["']|["']$/g, ""));
      else if ((m = v.match(/^\s+anchor:\s*\{\s*(object|creature):\s*(\d+)/))) add(cur, m[1] === "object" ? "object" : "npc", m[2]);
      else if ((m = v.match(/^\s+companions:\s*\[([^\]]*)\]/))) for (const id of m[1].match(/\d+/g) ?? []) add(cur, "npc", id);
      else if ((m = v.match(/^\s+landmark:\s*(\S+)/))) cur.landmark = m[1];
      else if (cur.id === "quarry" && (m = v.match(/^\s+id:\s*(\d+)/))) add(cur, "npc", m[1]);
      continue;
    }
    const section = l.match(/^## ([\w-]+)/);
    if (section) {
      close(n - 1);
      [cur, start] = [get(section[1]), n];
    }
  }
  close(lines.length);
  return { games, list: [...byId.values()] };
}

// The new side's changed lines of a -U0 diff (a deletion marks the lines
// around it).
export function changedLines(diff: string): number[] {
  const out: number[] = [];
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count === 0) out.push(start, start + 1);
    else for (let i = 0; i < count; i++) out.push(start + i);
  }
  return out;
}

export const touched = (list: Riddle[], lines: number[]) =>
  list.filter((r) => r.spans.some(([a, b]) => lines.some((n) => n >= a && n <= b)));

export function extras({ dir, root, range: r, files, git: inDir }: PacketContext): { lines: string[]; count: number } {
  const out: string[] = [];
  // (the code is packet.ts's own, moved: git(dir, …) as it was written)
  const git = (_dir: string, ...args: string[]) => inDir(...args);
  const riddleFiles = files.filter((f) => /^expeditions\/[^/]+\.md$/.test(f));
  if (!riddleFiles.length) return { lines: out, count: 0 };
  const card = join(root, "wow-data", "bin", "card.ts");
  const wanted: { riddle: string; game: Game; s: Subject }[] = [];
  const landmarks: string[] = [];
  for (const f of riddleFiles) {
    const text = r.working ? (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : undefined) : git(dir, "show", `${r.tip}:${f}`);
    if (text === undefined) continue;
    const diff = r.working ? git(dir, "diff", "-U0", r.base, "--", f) : git(dir, "diff", "-U0", r.base, r.tip, "--", f);
    const isNew = git(dir, "cat-file", "-e", `${r.base}:${f}`) === undefined;
    const { games, list } = riddles(text);
    for (const rd of isNew ? list : touched(list, changedLines(diff ?? ""))) {
      if (rd.landmark) landmarks.push(`${rd.id}: landmark ${rd.landmark} (wow-data's landmark table, no card)`);
      for (const s of rd.subjects)
        for (const game of games)
          if (!wanted.some((w) => w.s.kind === s.kind && w.s.arg === s.arg && w.game === game)) wanted.push({ riddle: rd.id, game, s });
    }
  }
  if (!wanted.length && !landmarks.length) return { lines: out, count: 0 };
  out.push("", "## Cards: the subjects of the riddles this change touches", "");
  const arg = (a: string) => (/^[\w.-]+$/.test(a) ? a : JSON.stringify(a));
  const cmd = (w: (typeof wanted)[number]) => `bun wow-data/bin/card.ts ${w.s.kind} ${arg(w.s.arg)} --game ${w.game}`;
  if (!existsSync(card)) {
    out.push("wow-data/bin/card.ts isn't there yet: the facts below are yours to look up, one card each when it lands:", "");
    for (const w of wanted) out.push(`- ${w.riddle}: \`${cmd(w)}\``);
  } else {
    for (const w of wanted.slice(0, MAX_CARDS)) {
      const p = Bun.spawnSync(["bun", card, w.s.kind, w.s.arg, "--game", w.game], { cwd: root, timeout: 60_000, stderr: "pipe" });
      out.push(`### ${w.riddle}: ${w.s.kind} ${w.s.arg} (${w.game})`, "");
      if (p.exitCode === 0) out.push("```", p.stdout.toString().trimEnd(), "```", "");
      else out.push(`card failed (exit ${p.exitCode}): ${p.stderr.toString().trim().split("\n")[0] ?? ""}`, "");
    }
    for (const w of wanted.slice(MAX_CARDS)) out.push(`- not drawn (${MAX_CARDS} at most): ${w.riddle}: \`${cmd(w)}\``);
  }
  for (const l of landmarks) out.push(`- ${l}`);
  return { lines: out, count: wanted.length };
}
