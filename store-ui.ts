/**
 * The store pages in a browser, from this computer: `bun addon-kit/store.ts
 * --ui` (from ~/code/wow-addons; `bun ../addon-kit/store.ts --ui` from an
 * addon) serves a page on 127.0.0.1 and opens it. Check runs every addon's
 * dry run, its log streamed into a window, each addon's state on its card,
 * its changes a click away; Put up publishes one addon (CurseForge's page,
 * Wago's page and summary, GitHub's description), asked first, refused when
 * its CURSEFORGE.md changed since it was checked, then read back. A
 * CurseForge summary still goes by hand, on its General page.
 *
 * The cookies never leave this computer. The server answers this machine
 * only (127.0.0.1, its Host checked), and a key made at each start, carried
 * by the page, keeps another site open in the browser from pressing a
 * button. `--demo`: made-up addons, nothing read or saved, to try the page.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { addons, apply, due, githubRepo, inspect, readPage, tell, type Report, type Say } from "./store";

export type View = {
  repo: string;
  title: string;
  id: number;
  hash: string;
  page: { state: Report["state"]; diff: string };
  summary: { file?: string; curseforge?: string };
  notes?: string;
  github: { slug?: string; note?: string; now?: string };
  wago: { error?: string; slug?: string; state?: "same" | "comments" | "changed"; diff?: string; summary?: string };
  semicolon: boolean;
  due: string[];
};

// (the whole page as read: its body and the notes in its comments, the
// summary and GitHub's description, all put up, all guarded)
const hashOf = (page: Report["page"]) => createHash("sha256").update(JSON.stringify(page)).digest("hex").slice(0, 16);

export function viewOf(r: Report): View {
  const w = r.wago;
  return {
    repo: basename(r.repo),
    title: r.page.title || basename(r.repo),
    id: r.id,
    hash: hashOf(r.page),
    page: { state: r.state, diff: r.changes },
    summary: { file: r.page.summary, ...(r.summary !== undefined && { curseforge: r.summary }) },
    ...(r.notes !== undefined && { notes: r.notes }),
    github: { slug: githubRepo(r.repo), note: r.page.github, ...(r.github && { now: r.github.now }) },
    wago: typeof w === "string" ? { error: w } : { slug: w.slug, state: w.state, diff: w.changes, ...(w.summary !== undefined && { summary: w.summary }) },
    semicolon: r.page.body.includes(";"),
    due: due(r),
  };
}

export type Deps = {
  addons: () => string[];
  title: (repo: string) => string;
  inspect: (repo: string) => Promise<Report>;
  apply: (r: Report, say: Say) => Promise<void>;
};

const real: Deps = {
  addons,
  title: (repo) => {
    const file = join(repo, "addon", "CURSEFORGE.md");
    return (existsSync(file) && readPage(readFileSync(file, "utf8")).title) || basename(repo);
  },
  inspect,
  apply,
};

// (a line of the stream: a log line, a card, an addon's failure, the end)
type Line = { log: string } | { view: View } | { error: { repo: string; message: string } } | { done: { checked: number; due: number } };

function stream(work: (send: (l: Line) => void) => Promise<void>): Response {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(c) {
        const send = (l: Line) => c.enqueue(enc.encode(JSON.stringify(l) + "\n"));
        try {
          await work(send);
        } catch (err) {
          send({ log: `✗ ${err instanceof Error ? err.message : String(err)}` });
        }
        c.close();
      },
    }),
    { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } },
  );
}

/** The server's answers: the page, then Check and Put up behind the start's key. */
export function handler(deps: Deps, key: string, port: number) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const repos = () => new Map(deps.addons().map((r) => [basename(r), r]));
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    // (this machine only: another name pointed at 127.0.0.1 is refused)
    if (!hosts.has(req.headers.get("host") ?? "")) return new Response("not here", { status: 403 });
    if (req.method === "GET" && url.pathname === "/") {
      const list = [...repos()].map(([name, repo]) => ({ repo: name, title: deps.title(repo) }));
      // (never framed: another page can't click Put up through it)
      return new Response(page(key, list), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-frame-options": "DENY",
          "content-security-policy": "frame-ancestors 'none'",
        },
      });
    }
    if (req.method !== "POST") return new Response("no such page", { status: 404 });
    if (req.headers.get("x-store-key") !== key) return new Response("this page's key, or nothing", { status: 403 });
    const body = (await req.json().catch(() => ({}))) as { repo?: string; hash?: string };

    if (url.pathname === "/check") {
      const all = repos();
      const chosen = body.repo ? [...all].filter(([n]) => n === body.repo) : [...all];
      return stream(async (send) => {
        send({ log: `Checking ${chosen.length === 1 ? chosen[0][0] : `${chosen.length} addons`}: nothing is saved.` });
        let toDo = 0;
        let unread = 0;
        await Promise.all(
          chosen.map(async ([name, repo]) => {
            try {
              const r = await deps.inspect(repo);
              const lines: string[] = [];
              tell(r, false, (l) => lines.push(l));
              send({ log: lines.join("\n") });
              const v = viewOf(r);
              if (v.due.length) toDo++;
              send({ view: v });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              // (an addon not on CurseForge yet: said, no error)
              if (message.startsWith("no X-Curse-Project-ID")) {
                send({ log: `${name}: not on CurseForge yet (no X-Curse-Project-ID in its TOCs)` });
                return;
              }
              unread++;
              send({ log: `${name}: ✗ ${message}` });
              send({ error: { repo: name, message } });
            }
          }),
        );
        const put = toDo ? `${toDo} to put up. Nothing was saved.` : "✓ every page read is its file.";
        send({ log: unread ? `✗ ${unread} not read. ${toDo ? put : "Nothing was saved."}` : toDo ? put : "✓ every page is its file." });
        send({ done: { checked: chosen.length, due: toDo } });
      });
    }

    if (url.pathname === "/apply") {
      const repo = body.repo && repos().get(body.repo);
      if (!repo || !body.hash) return new Response("which addon, as checked", { status: 400 });
      return stream(async (send) => {
        const say: Say = (l) => send({ log: l });
        say(`${body.repo}: read again before anything is saved…`);
        const r = await deps.inspect(repo);
        if (hashOf(r.page) !== body.hash) {
          say("✗ its CURSEFORGE.md changed since it was checked: check it again, read the changes, then put it up.");
          send({ view: viewOf(r) });
          return send({ done: { checked: 1, due: due(r).length ? 1 : 0 } });
        }
        const todo = due(r);
        if (!todo.length) say("✓ nothing to put up: every page is already its file.");
        else {
          say(`Putting up ${todo.join(", ")}…`);
          await deps.apply(r, say);
        }
        say("Read back:");
        const after = await deps.inspect(repo);
        tell(after, false, say);
        send({ view: viewOf(after) });
        send({ done: { checked: 1, due: due(after).length ? 1 : 0 } });
      });
    }
    return new Response("no such page", { status: 404 });
  };
}

/** Serves the page on 127.0.0.1 (STORE_UI_PORT, else 4190) and opens it in the browser. */
export async function open(opts: { demo?: boolean } = {}) {
  const port = Number(process.env.STORE_UI_PORT ?? 4190);
  const key = randomBytes(18).toString("base64url");
  Bun.serve({ hostname: "127.0.0.1", port, fetch: handler(opts.demo ? demo() : real, key, port), idleTimeout: 120 });
  const url = `http://127.0.0.1:${port}/`;
  console.log(`store pages: ${url}${opts.demo ? " (made-up addons: nothing is read or saved)" : ""}  (ctrl-c to stop)`);
  if (!process.env.STORE_UI_NO_BROWSER) Bun.spawn(["open", url]);
}

// ── made-up addons, to try the page (--demo) ─────────────────────────────────
function demo(): Deps {
  const body = (extra = "") => `# Yonder\n\nRiddles, rare hunts and an explorer's journal.\n${extra}\n## Support\n\nA coffee on Ko-fi.\n`;
  let yonder = body("\nNew: an Ores tab.\n");
  let live = body();
  const report = (repo: string): Report => {
    const changed = repo.endsWith("yonder") && live !== yonder;
    return {
      repo,
      page: { title: repo.endsWith("yonder") ? "Yonder" : "Keyring", summary: "Solve riddles.", github: "Riddles and hunts.", body: repo.endsWith("yonder") ? yonder : body() },
      id: repo.endsWith("yonder") ? 1728396 : 1739386,
      state: changed ? "changed" : "same",
      changes: changed ? "--- the live page\n+++ CURSEFORGE.md\n@@ -2,4 +2,6 @@\n \n Riddles, rare hunts and an explorer's journal.\n \n+New: an Ores tab.\n+\n ## Support\n" : "",
      ...(repo.endsWith("yonder") && changed && { summary: "Solve riddles, hunt rares." }),
      wago: repo.endsWith("keyring") ? "no session (~/.config/wow-addons/wago-cookie)" : { slug: "yonder", props: {}, state: changed ? "changed" : "same", changes: "" },
    };
  };
  return {
    addons: () => ["/demo/yonder", "/demo/keyring"],
    title: (repo) => (repo.endsWith("yonder") ? "Yonder" : "Keyring"),
    inspect: async (repo) => {
      await Bun.sleep(600);
      return report(repo);
    },
    apply: async (_r, say) => {
      await Bun.sleep(800);
      live = yonder;
      say("  ✓ project 1728396: the live page is the file");
      say("  ✓ Wago's yonder: the page and summary are the file's");
    },
  };
}

// ── the page ─────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function page(key: string, list: { repo: string; title: string }[]): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Store pages</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${STYLE}</style></head><body>
<main>
<header class="top"><div><h1 class="title">Store pages</h1><p id="status">Each addon's CURSEFORGE.md against CurseForge, Wago and GitHub. Nothing is saved until you put one up.</p></div>
<button class="btn btn-gold" id="check">Check all</button></header>
<div class="cards">${list.map((a) => `<section class="panel card" id="card-${esc(a.repo)}" data-repo="${esc(a.repo)}"><div class="head"><h2>${esc(a.title)}</h2><span class="tag">not checked</span></div><p class="sub">Check to compare it with its pages.</p></section>`).join("")}</div>
</main>
<div class="veil" id="veil" hidden><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="m-title"><div class="m-head"><h2 class="title" id="m-title"></h2><button class="btn btn-ghost x" id="m-close" aria-label="Close">✕</button></div><div class="m-body" id="m-body"></div><div class="m-foot" id="m-foot"></div></div></div>
<script>const KEY=${JSON.stringify(key)};${SCRIPT}</script></body></html>`;
}

const STYLE = `
:root{color-scheme:dark;--night:#0b0c10;--stone:#121319;--stone-2:#181a21;--stone-3:#21242d;--edge:#2b2f3a;--edge-gold:#5a4a2a;--parchment:#ece3cf;--dim:#a39b88;--faint:#6f6a5e;--gold:#f2c14e;--gold-soft:#c9a227;--ok:#6fd08c;--blood:#e0634f;--display:"Cinzel",Georgia,serif;--sans:"Inter",ui-sans-serif,system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:radial-gradient(1200px 600px at 70% -10%,rgb(242 193 78/.06),transparent 60%),var(--night);color:var(--parchment);font:14px/1.5 var(--sans);-webkit-font-smoothing:antialiased;min-height:100vh}
main{max-width:1080px;margin:0 auto;padding:28px 24px 64px}
.title{font-family:var(--display);font-weight:700;letter-spacing:.03em;color:var(--gold);margin:0}
.top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px}.top h1{font-size:26px}.top p{margin:4px 0 0;color:var(--dim);max-width:640px}
.panel{border:1px solid var(--edge);border-radius:12px;background:linear-gradient(180deg,color-mix(in srgb,var(--stone-2) 98%,white 2%),var(--stone));box-shadow:inset 0 1px 0 rgb(255 255 255/.03),inset 0 0 0 1px rgb(242 193 78/.05),0 10px 30px rgb(0 0 0/.35)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;height:2.25rem;padding:0 .95rem;border-radius:8px;border:1px solid var(--edge);background:linear-gradient(180deg,var(--stone-3),var(--stone-2));color:var(--parchment);font:500 14px var(--sans);cursor:pointer;white-space:nowrap}
.btn:hover{border-color:var(--edge-gold);filter:brightness(1.12)}.btn:disabled{opacity:.45;cursor:default;filter:none}
.btn-gold{border-color:#f6d27a;background:linear-gradient(180deg,#f6d27a,#c9a227 60%,#a07a1c);color:#22170a;font-weight:600}
.btn-ghost{border-color:transparent;background:transparent;color:var(--dim)}.btn-blood{border-color:rgb(224 99 79/.6);background:linear-gradient(180deg,#a8402f,#7c2a1e);color:#fff;font-weight:600}
.tag{display:inline-flex;align-items:center;height:1.35rem;padding:0 .55rem;border-radius:999px;border:1px solid rgb(255 255 255/.12);color:var(--dim);font-size:11px;font-weight:500;white-space:nowrap}
.tag.ok{border-color:rgb(111 208 140/.35);color:var(--ok)}.tag.gold{border-color:rgb(242 193 78/.4);color:var(--gold)}.tag.blood{border-color:rgb(224 99 79/.45);color:var(--blood)}
.sub{color:var(--faint);font-size:12px;margin:6px 0 0}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.card{padding:16px 18px;display:flex;flex-direction:column}.card .head{display:flex;align-items:center;justify-content:space-between;gap:10px}.card h2{margin:0;font:600 15px var(--sans)}
.card.busy .head .tag{animation:pulse 1.4s ease-in-out infinite}@keyframes pulse{50%{opacity:.4}}
.rows{margin:10px 0 0;padding:0;list-style:none}.rows li{display:grid;grid-template-columns:110px minmax(0,1fr);gap:10px;padding:6px 0;border-top:1px solid rgb(255 255 255/.045);font-size:13px}.rows li:first-child{border-top:0}
.rows .k{color:var(--faint)}.rows .v{color:var(--dim);min-width:0}.rows .v b{color:var(--parchment);font-weight:500}.ok-t{color:var(--ok)}.gold-t{color:var(--gold)}.blood-t{color:var(--blood)}
.actions{display:flex;gap:8px;margin-top:auto;padding-top:12px}
a{color:var(--gold);text-decoration:none}a:hover{text-decoration:underline}
.veil{position:fixed;inset:0;background:rgb(0 0 0/.6);backdrop-filter:blur(3px);display:grid;place-items:center;padding:20px;z-index:10}
.modal{width:min(880px,100%);max-height:min(86vh,900px);display:flex;flex-direction:column}
.m-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--edge)}.m-head h2{font-size:18px}.x{width:36px;padding:0}
.m-body{padding:14px 18px;overflow:auto;flex:1}.m-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--edge)}.m-foot:empty{display:none}
.log{margin:0;font:12.5px/1.6 var(--mono);color:var(--dim);white-space:pre-wrap;word-break:break-word}.log .ok-t{color:var(--ok)}.log .blood-t{color:var(--blood)}
.diff{margin:6px 0 16px;border:1px solid var(--edge);border-radius:8px;overflow:auto;font:12.5px/1.55 var(--mono);background:rgb(0 0 0/.25)}
.diff div{padding:0 12px;white-space:pre-wrap;word-break:break-word}.diff .add{background:rgb(111 208 140/.1);color:#b6ebc6}.diff .del{background:rgb(224 99 79/.12);color:#f2b2a6}.diff .hunk{color:var(--faint);background:rgb(255 255 255/.03)}.diff .file{color:var(--faint)}
.m-body h3{margin:4px 0 0;font:600 13px var(--sans)}.m-body .pair{display:grid;grid-template-columns:110px minmax(0,1fr);gap:4px 10px;margin:8px 0 16px;font-size:13px}.m-body .pair span:nth-child(odd){color:var(--faint)}
.warn{border:1px solid rgb(224 99 79/.4);background:rgb(224 99 79/.08);border-radius:8px;padding:10px 12px;color:#f2b2a6;font-size:13px;margin-bottom:12px}
@media (max-width:640px){.top{flex-direction:column}.rows li{grid-template-columns:90px minmax(0,1fr)}}
`;

// (the page's script: the cards, the stream read line by line, the window)
const SCRIPT = `
const $=(id)=>document.getElementById(id);
const esc=(s)=>String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"})[c]);
const views={};let busy=false;
const veil=$("veil"),mTitle=$("m-title"),mBody=$("m-body"),mFoot=$("m-foot");
const close=()=>{if(busy)return;veil.hidden=true};$("m-close").onclick=close;veil.onclick=(e)=>{if(e.target===veil)close()};addEventListener("keydown",(e)=>{if(e.key==="Escape")close()});
function modal(title,body,foot=""){mTitle.textContent=title;mBody.innerHTML=body;mFoot.innerHTML=foot;veil.hidden=false}
const tone=(l)=>/✓/.test(l)?"ok-t":/✗|differs|changed|!/.test(l)?"blood-t":"";
function logLine(text){const pre=$("log");if(!pre)return;for(const l of String(text).split("\\n")){const s=document.createElement("span");s.className=tone(l);s.textContent=l+"\\n";pre.appendChild(s)}mBody.scrollTop=mBody.scrollHeight}
async function run(path,body,onLine){
  const res=await fetch(path,{method:"POST",headers:{"content-type":"application/json","x-store-key":KEY},body:JSON.stringify(body)});
  if(!res.ok){onLine({log:"✗ "+res.status+" "+(await res.text())});return}
  const reader=res.body.getReader(),dec=new TextDecoder();let buf="";
  for(;;){const {value,done}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;while((i=buf.indexOf("\\n"))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);if(line)onLine(JSON.parse(line))}}
}
const state=(v)=>v.due.length?["gold","to put up"]:v.summary.curseforge!==undefined||v.notes!==undefined?["gold","summary by hand"]:v.wago.error?["ok","✓ (Wago not read)"]:["ok","✓ its file"];
function row(k,v){return "<li><span class=\\"k\\">"+k+"</span><span class=\\"v\\">"+v+"</span></li>"}
function card(v){
  views[v.repo]=v;const el=$("card-"+v.repo);if(!el)return;el.classList.remove("busy");
  const [t,label]=state(v);
  const page=v.page.state==="same"?"<span class=ok-t>✓ the file</span>":v.page.state==="format"?"<span class=gold-t>same words, to become Markdown</span>":"<span class=gold-t>changed</span>";
  const sum=v.summary.curseforge===undefined?"<span class=ok-t>✓ the file's</span>":"<span class=gold-t>differs: by hand, on</span> <a href=\\"https://authors.curseforge.com/#/projects/"+v.id+"/general\\" target=_blank rel=noopener>its General page ↗</a>";
  const notes=v.notes===undefined?"<span class=ok-t>✓ the summary</span>":"<span class=blood-t>differ from the summary</span>";
  const gh=!v.github.note?"<span>no note in the file</span>":v.github.now===undefined?"<span class=ok-t>✓ the file's</span>":"<span class=gold-t>differs</span>";
  const w=v.wago.error?"<span>not read: "+esc(v.wago.error)+"</span>":(v.wago.state==="same"?"<span class=ok-t>✓ the file</span>":v.wago.state==="comments"?"<span class=gold-t>same words, comments to go</span>":"<span class=gold-t>changed</span>")+(v.wago.summary!==undefined?" · <span class=gold-t>summary differs</span>":"");
  const links=["<a href=\\"https://authors.curseforge.com/#/projects/"+v.id+"/description\\" target=_blank rel=noopener>CurseForge ↗</a>",v.wago.slug?"<a href=\\"https://addons.wago.io/developers/projects/"+encodeURIComponent(v.wago.slug)+"/settings\\" target=_blank rel=noopener>Wago ↗</a>":"",v.github.slug?"<a href=\\"https://github.com/"+esc(v.github.slug)+"\\" target=_blank rel=noopener>GitHub ↗</a>":""].filter(Boolean).join(" · ");
  const differs=v.page.state!=="same"||(v.wago.state&&v.wago.state!=="same")||v.wago.summary!==undefined||v.summary.curseforge!==undefined||v.notes!==undefined||v.github.now!==undefined;
  el.innerHTML="<div class=head><h2>"+esc(v.title)+"</h2><span class=\\"tag "+t+"\\">"+esc(label)+"</span></div>"
    +"<ul class=rows>"+row("CurseForge",page)+row("Summary",sum)+row("TOC Notes",notes)+row("Wago",w)+row("GitHub",gh)+(v.semicolon?row("!","<span class=blood-t>a semicolon in the page</span>"):"")+"</ul>"
    +"<p class=sub>"+links+"</p>"
    +"<div class=actions>"+(differs?"<button class=btn data-changes=\\""+esc(v.repo)+"\\">Changes</button>":"")+(v.due.length?"<button class=\\"btn btn-gold\\" data-put=\\""+esc(v.repo)+"\\">Put up</button>":"")+"<button class=\\"btn btn-ghost\\" data-recheck=\\""+esc(v.repo)+"\\">Check again</button></div>";
}
function failed(repo,message){const el=$("card-"+repo);if(!el)return;el.classList.remove("busy");el.querySelector(".head .tag").outerHTML="<span class=\\"tag blood\\">not read</span>";el.querySelector(".sub").textContent=message}
function diffHtml(text){if(!String(text||"").trim())return "<p class=sub>Its words differ in a way the diff doesn't show (spacing): put up, it becomes the file.</p>";return "<div class=diff>"+String(text).split("\\n").filter((l,i,a)=>!(i===a.length-1&&l==="")).map(l=>"<div class=\\""+(l.startsWith("+++")||l.startsWith("---")?"file":l.startsWith("@@")?"hunk":l.startsWith("+")?"add":l.startsWith("-")?"del":"")+"\\">"+(esc(l)||" ")+"</div>").join("")+"</div>"}
function changes(v){
  let h=v.semicolon?"<div class=warn>A semicolon in the page: none in what players read.</div>":"";
  if(v.page.state==="changed")h+="<h3>CurseForge's page</h3>"+diffHtml(v.page.diff);
  else if(v.page.state==="format")h+="<h3>CurseForge's page</h3><p class=sub>The same words, in the editor's HTML: put up, it becomes the file's Markdown.</p>";
  if(v.wago.state==="changed")h+="<h3>Wago's page</h3>"+diffHtml(v.wago.diff);
  else if(v.wago.state==="comments")h+="<h3>Wago's page</h3><p class=sub>The same words, with the file's comments a hand paste left: put up, they go.</p>";
  const pair=(store,now)=>"<div class=pair><span>"+store+"</span><span>"+esc(now)+"</span><span>The file's</span><span>"+esc(v.summary.file)+"</span></div>";
  if(v.wago.summary!==undefined)h+="<h3>Wago's summary</h3>"+pair("Wago's",v.wago.summary);
  if(v.summary.curseforge!==undefined)h+="<h3>CurseForge's summary</h3><p class=sub>By hand, on the project's General page (its save sends the whole project).</p>"+pair("CurseForge's",v.summary.curseforge);
  if(v.notes!==undefined)h+="<h3>TOC Notes</h3><div class=pair><span>The TOCs'</span><span>"+esc(v.notes)+"</span><span>The summary</span><span>"+esc(v.summary.file)+"</span></div>";
  if(v.github.now!==undefined)h+="<h3>GitHub's description</h3><div class=pair><span>GitHub's</span><span>"+esc(v.github.now)+"</span><span>The file's</span><span>"+esc(v.github.note)+"</span></div>";
  modal(v.title+": what differs",h||"<p class=sub>Nothing differs.</p>",v.due.length?"<button class=\\"btn btn-gold\\" data-put=\\""+esc(v.repo)+"\\">Put up…</button>":"");
}
function status(){const vs=Object.values(views),due=vs.filter(v=>v.due.length).length,hand=vs.filter(v=>v.summary.curseforge!==undefined).length;
  $("status").textContent=(due?due+" addon"+(due>1?"s":"")+" to put up: read the changes first.":"Every page checked is its file.")+(hand?" "+hand+" CurseForge summar"+(hand>1?"ies":"y")+" to change by hand.":"")}
function setBusy(b){busy=b;$("check").disabled=b;document.querySelectorAll("[data-put],[data-recheck]").forEach(x=>x.disabled=b);$("m-close").disabled=b}
async function check(repo){
  if(busy)return;setBusy(true);
  const names=repo?[repo]:[...document.querySelectorAll(".card")].map(c=>c.dataset.repo);
  for(const n of names){const el=$("card-"+n);el.classList.add("busy");el.querySelector(".head .tag").textContent="checking…"}
  modal(repo?"Checking "+(views[repo]?.title??repo):"Checking every addon","<pre class=log id=log></pre>");
  let due=0;
  try{await run("/check",repo?{repo}:{},(l)=>{if(l.log)logLine(l.log);if(l.view)card(l.view);if(l.error)failed(l.error.repo,l.error.message);if(l.done)due=l.done.due})}
  catch(e){logLine("✗ "+e.message)}
  setBusy(false);status();
  mFoot.innerHTML="<button class=btn id=done>Close</button>";$("done").onclick=close;
}
function confirmPut(repo){
  const v=views[repo];if(!v)return;
  modal("Put up "+v.title+"?","<p>This publishes at once, players see it:</p><ul>"+v.due.map(d=>"<li><b>"+esc(d)+"</b></li>").join("")+"</ul><p class=sub>From its CURSEFORGE.md as checked. If the file changed since, nothing is saved. Each store is read back after.</p>"+(v.summary.curseforge!==undefined?"<p class=sub>CurseForge's summary stays: change it by hand on the General page.</p>":""),
    "<button class=btn id=cancel>Cancel</button><button class=\\"btn btn-blood\\" id=go>Publish</button>");
  $("cancel").onclick=close;$("go").onclick=()=>put(repo);
}
async function put(repo){
  const v=views[repo];setBusy(true);
  modal("Putting up "+v.title,"<pre class=log id=log></pre>");
  try{await run("/apply",{repo,hash:v.hash},(l)=>{if(l.log)logLine(l.log);if(l.view)card(l.view)})}
  catch(e){logLine("✗ "+e.message)}
  setBusy(false);status();mFoot.innerHTML="<button class=btn id=done>Close</button>";$("done").onclick=close;
}
$("check").onclick=()=>check();
document.addEventListener("click",(e)=>{const t=e.target.closest("button");if(!t||t.disabled)return;
  if(t.dataset.changes)changes(views[t.dataset.changes]);else if(t.dataset.put)confirmPut(t.dataset.put);else if(t.dataset.recheck)check(t.dataset.recheck)});
`;
