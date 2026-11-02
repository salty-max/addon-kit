// The CurseForge summary's save (store.ts): the body of the General page's
// PUT, and the check that only the summary moved. A made-up project, nothing
// read from CurseForge. bun test
import { describe, expect, test } from "bun:test";
import { applySummary, checkRead, detailsBody, due, movedFields, type Caller, type Report } from "./store";

const project = {
  id: 1,
  name: "Demo: a thing",
  slug: "demo",
  summary: "Old summary.",
  avatarUrl: "https://media.example/avatar.png",
  primaryCategoryId: 1011,
  subCategoryIds: [],
  allowComments: true,
  enableProjectPages: false,
  donationTypeId: 8,
  donationIdentifier: "someone",
  unlisted: false,
  isFreemium: false,
  role: "owner",
};
const links = [{ url: "https://github.com/someone/demo", type: 13 }];

describe("detailsBody", () => {
  test("every field of the General page's save, the summary the file's, the links as read", () => {
    expect(detailsBody(project, links, "New summary.")).toEqual({
      summary: "New summary.",
      slug: "demo",
      name: "Demo: a thing",
      avatarUrl: "https://media.example/avatar.png",
      primaryCategoryId: 1011,
      subCategoryIds: [],
      allowComments: true,
      enableProjectPages: false,
      wikiUrl: "",
      donationTypeId: 8,
      donationIdentifier: "someone",
      links,
      unlisted: false,
      isFreemium: false,
    });
  });

  test("a project without a wiki or a donation name sends empty strings, as the page does", () => {
    const body = detailsBody({ ...project, donationIdentifier: undefined, wikiUrl: null }, [], "x");
    expect(body.wikiUrl).toBe("");
    expect(body.donationIdentifier).toBe("");
  });
});

describe("movedFields", () => {
  test("only the summary changed: nothing moved", () => {
    expect(movedFields(project, { ...project, summary: "New summary." }, links, links)).toEqual([]);
  });

  test("a field the save changed is named, and the links", () => {
    expect(movedFields(project, { ...project, summary: "New", allowComments: false, subCategoryIds: [3] }, links, [])).toEqual(["subCategoryIds", "allowComments", "links"]);
  });

  test("fields the save doesn't send are not compared", () => {
    expect(movedFields(project, { ...project, role: "member", lastUpdated: "later" }, links, links)).toEqual([]);
  });
});

describe("due", () => {
  const report = (extra: Partial<Report>): Report =>
    ({ repo: "demo", page: { title: "Demo", summary: "New summary.", body: "x\n" }, id: 1, state: "same", changes: "", wago: "no session", ...extra }) as Report;

  test("a summary that differs is put up by --apply", () => {
    expect(due(report({ summary: "Old summary." }))).toEqual(["CurseForge's summary"]);
  });

  test("a summary that matches is nothing to put up", () => {
    expect(due(report({}))).toEqual([]);
  });
});

describe("checkRead", () => {
  test("a project with every field and a list of links passes", () => {
    expect(checkRead(project, { links, id: "1" })).toEqual(links);
  });

  test("links in any other shape are refused: the save would clear them", () => {
    for (const odd of [links, { data: links }, { socialLinks: links }, null, {}]) expect(() => checkRead(project, odd)).toThrow(/links read/);
  });

  test("a field GET lacks is named and refused (the optional ones aside)", () => {
    const { unlisted: _u, isFreemium: _f, ...lacking } = project;
    expect(() => checkRead(lacking, { links })).toThrow(/unlisted, isFreemium/);
    expect(() => checkRead({ ...project, wikiUrl: undefined, donationTypeId: undefined, donationIdentifier: undefined }, { links })).not.toThrow();
  });
});

describe("applySummary", () => {
  const r = { id: 1, page: { title: "Demo", summary: "New summary.", body: "x\n" } };
  // a fake CurseForge: the project, its links, the saves kept
  const fake = (over: { links?: unknown; saved?: (p: any) => any; lag?: number } = {}) => {
    let current: any = { ...project };
    const calls: string[] = [];
    let lag = over.lag ?? 0;
    const api: Caller = async (method, path, body) => {
      calls.push(`${method} ${path}`);
      if (method === "PUT") {
        const next = over.saved ? over.saved(body) : { ...current, ...body, links: undefined };
        current = lag > 0 ? current : next;
        pending = next;
        return null;
      }
      if (path.startsWith("projects/social-links")) return over.links ?? { links };
      if (lag > 0 && method === "GET") {
        lag--;
        if (lag === 0) current = pending;
      }
      return current;
    };
    let pending: any;
    return { api, calls, say: [] as string[] };
  };

  test("the PUT carries the file's summary and every other field as read", async () => {
    const f = fake();
    let body: any;
    const api: Caller = async (m, p, b) => (m === "PUT" ? ((body = b), f.api(m, p, b)) : f.api(m, p, b));
    await applySummary(r, (l) => f.say.push(l), api, 0);
    expect(body).toEqual(detailsBody(project, links, "New summary."));
    expect(f.say).toEqual(["  ✓ project 1: the summary is the file's"]);
  });

  test("links of an odd shape: nothing is sent", async () => {
    const f = fake({ links: links });
    await expect(applySummary(r, () => {}, f.api, 0)).rejects.toThrow(/links read/);
    expect(f.calls.some((c) => c.startsWith("PUT"))).toBe(false);
  });

  test("a read that lags is read again until the summary shows", async () => {
    const f = fake({ lag: 3 });
    await applySummary(r, (l) => f.say.push(l), f.api, 0);
    expect(f.say).toHaveLength(1);
  });

  test("a field the save changed is reported", async () => {
    const f = fake({ saved: (b) => ({ ...project, ...b, links: undefined, allowComments: false }) });
    await expect(applySummary(r, () => {}, f.api, 0)).rejects.toThrow(/changed allowComments/);
  });
});
