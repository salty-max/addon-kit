// The store pages' browser page (store-ui.ts), its server with made-up
// addons: nothing read from the stores, nothing saved. bun test
import { describe, expect, test } from "bun:test";
import type { Report } from "./store";
import { handler, type Deps, type View } from "./store-ui";

const PORT = 4190;
const KEY = "k3y";

function fake(): Deps & { saved: string[]; file: { body: string } } {
  const file = { body: "# Yonder\n\nNew words.\n" };
  let live = "# Yonder\n\nOld words.\n";
  const saved: string[] = [];
  const report = (repo: string): Report => ({
    repo,
    page: { title: "Yonder", summary: "Riddles.", body: file.body },
    id: 1728396,
    state: live === file.body ? "same" : "changed",
    changes: live === file.body ? "" : "--- the live page\n+++ CURSEFORGE.md\n-Old words.\n+New words.\n",
    wago: "no session (~/.config/wow-addons/wago-cookie)",
  });
  return {
    saved,
    file,
    addons: () => ["/x/yonder"],
    title: () => "Yonder",
    inspect: async (repo) => report(repo),
    apply: async (r, say) => {
      saved.push(r.page.body);
      live = r.page.body;
      say("  ✓ project 1728396: the live page is the file");
    },
  };
}

const ask = (h: ReturnType<typeof handler>, path: string, init: { host?: string; key?: string; body?: unknown; method?: string } = {}) =>
  h(
    new Request(`http://127.0.0.1:${PORT}${path}`, {
      method: init.method ?? "POST",
      headers: { host: init.host ?? `127.0.0.1:${PORT}`, ...(init.key !== undefined ? { "x-store-key": init.key } : {}) },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    }),
  );
const lines = async (res: Response) => (await res.text()).trim().split("\n").map((l) => JSON.parse(l));

describe("the store pages' page", () => {
  test("this machine and this page only: another host, or no key, is refused", async () => {
    const h = handler(fake(), KEY, PORT);
    expect((await ask(h, "/", { method: "GET", host: "evil.example:4190" })).status).toBe(403);
    const page = await (await ask(h, "/", { method: "GET" })).text();
    expect(page).toContain('const KEY="k3y"');
    expect(page).toContain('id="card-yonder"');
    expect((await ask(h, "/check", { body: {} })).status).toBe(403);
    expect((await ask(h, "/check", { key: "wrong", body: {} })).status).toBe(403);
  });

  test("check: the log and each addon's card, what differs and what would go up; nothing saved", async () => {
    const f = fake();
    const out = await lines(await ask(handler(f, KEY, PORT), "/check", { key: KEY, body: {} }));
    const view = out.find((l) => l.view)!.view as View;
    expect(view).toMatchObject({ repo: "yonder", page: { state: "changed" }, due: ["CurseForge's page"], wago: { error: "no session (~/.config/wow-addons/wago-cookie)" } });
    expect(view.page.diff).toContain("+New words.");
    expect(out.some((l) => /page\s+changed$/m.test(l.log ?? ""))).toBe(true);
    expect(out.at(-1)).toEqual({ done: { checked: 1, due: 1 } });
    expect(f.saved).toEqual([]);
  });

  test("put up: refused when the file changed since it was checked, else saved and read back", async () => {
    const f = fake();
    const h = handler(f, KEY, PORT);
    const checked = (await lines(await ask(h, "/check", { key: KEY, body: {} }))).find((l) => l.view).view as View;
    f.file.body = "# Yonder\n\nNewer words still.\n";
    const refused = await lines(await ask(h, "/apply", { key: KEY, body: { repo: "yonder", hash: checked.hash } }));
    expect(refused.some((l) => l.log?.includes("changed since it was checked"))).toBe(true);
    expect(f.saved).toEqual([]);
    const again = (await lines(await ask(h, "/check", { key: KEY, body: { repo: "yonder" } }))).find((l) => l.view).view as View;
    const done = await lines(await ask(h, "/apply", { key: KEY, body: { repo: "yonder", hash: again.hash } }));
    expect(f.saved).toEqual(["# Yonder\n\nNewer words still.\n"]);
    expect(done.some((l) => l.log?.includes("✓ project 1728396"))).toBe(true);
    expect(done.find((l) => l.view).view).toMatchObject({ page: { state: "same" }, due: [] });
    expect((await ask(h, "/apply", { key: KEY, body: { repo: "nope", hash: "x" } })).status).toBe(400);
  });

  test("the page's script parses", async () => {
    const page = await (await ask(handler(fake(), KEY, PORT), "/", { method: "GET" })).text();
    for (const m of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(m[1])).not.toThrow();
  });
});
