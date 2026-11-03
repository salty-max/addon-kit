// Launch night's page (launch.ts serves it). KEY and DEMO come from the server.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const WORD = { green: "ready", amber: "look", red: "blocked", grey: "waiting" };
const OVERALL = { green: ["✓", "Ready for launch", "Everything the tools can check is green."], amber: ["!", "Look at the amber", ""], red: ["✕", "Fix the red first", ""], grey: ["…", "Gathering", "The first answers are still coming in."] };
let S = null;
let offset = 0;
let lastOk = Date.now(); // (from the page's start, so a server that never answers shows the banner too)
let shot = null; // the screenshot attached to the note being written
let lastShots = "";

async function api(path, body) {
  const res = await fetch(path, { method: body ? "POST" : "GET", headers: { "x-launch-key": KEY, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const when = (iso) => new Date(iso).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const hhmm = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const ago = (at) => {
  if (!at) return "never";
  const s = Math.max(0, Math.round((Date.now() + offset - at) / 1000));
  return s < 90 ? `${s} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};
const age = (k) => {
  const a = S.ages[k];
  if (!a) return "not read yet";
  return a.error ? `<span style="color:var(--red)" title="${esc(a.error)}">failed ${esc(ago(a.at))}</span>` : ago(a.at);
};
const busy = (k) => S.busy.includes(k);

// ── drawing ─────────────────────────────────────────────────────────────────
function tickClock() {
  $("#stale").hidden = Date.now() - lastOk < 60000;
  if (!S) return;
  const s = Math.round((Date.now() + offset - Date.parse(S.launch)) / 1000);
  const a = Math.abs(s);
  const p = (n) => String(n).padStart(2, "0");
  const days = Math.floor(a / 86400);
  const h = Math.floor((a % 86400) / 3600);
  $("#clock").firstChild.textContent = `T${s < 0 ? "−" : "+"}${days ? days + "d " : ""}${days ? p(h) : h}:${p(Math.floor((a % 3600) / 60))}:${p(a % 60)}`;
}

function band() {
  const counts = { red: 0, amber: 0 };
  for (const l of [S.build.light, S.chain.light, S.infra.light, S.board.light, S.sources.light, ...S.addons.map((a) => a.light)]) if (counts[l] !== undefined) counts[l]++;
  const [sym, title, sub] = OVERALL[S.overall];
  const detail = sub || [counts.red && `${counts.red} red`, counts.amber && `${counts.amber} amber`].filter(Boolean).join(", ") + " below.";
  const b = S.build;
  $("#band").innerHTML = `
    <div id="clock" class="clock"><span></span><small>Launch ${esc(when(S.launch))}${DEMO ? " · demo" : ""}</small></div>
    <div class="verdict"><div class="beacon ${S.overall}" aria-hidden="true">${sym}</div><div><b>${esc(title)}</b><span>${esc(detail)}</span></div></div>
    <div>
      <div class="buildline"><span>Forever pin <b>${esc(b.pin ?? "?")}</b></span><span>wago.tools <b>${esc(b.latest ?? "?")}</b></span><span>TOCs <b>${esc(b.toc)}</b></span></div>
      <div class="side-actions"><span class="hint">${S.busy.length ? "reading " + esc(S.busy.join(", ")) + "…" : ""}</span><button class="btn gold" data-act="refresh-all" ${S.busy.length ? "disabled" : ""}>Refresh all</button></div>
    </div>`;
  tickClock();
}

function card(a) {
  const ci = a.ci ? `<span class="chip ${a.ci === "success" ? "green" : "red"}">CI ${a.ci === "success" ? "✓" : esc(a.ci)}</span>` : "";
  const zip = a.zip ? `<span class="chip ${a.zip.mark === "✓" ? "green" : "amber"}" title="${esc(a.zip.text)}">${a.zip.mark === "✓" ? "zip current" : /^none/.test(a.zip.text) ? "no zip" : "zip behind"}</span>` : "";
  const done = a.checks.filter((c) => c.tick === "ok").length;
  const game = a.inGame.light === "grey" ? "not tested" : a.inGame.light === "red" ? "broken" : `${done}/${a.checks.length} ok`;
  const gameLight = a.inGame.light === "grey" ? "" : a.inGame.light;
  return `<section class="panel card ${a.light}" id="card-${esc(a.id)}">
    <div class="head"><span class="rank">${a.rank}</span><h3>${esc(a.name)}<small>${esc(a.slash)}</small></h3><span class="dot ${a.light}" role="img" aria-label="${a.light}"></span></div>
    <div class="chips">
      <span class="chip ${a.readiness.light}">${WORD[a.readiness.light]}</span>${a.version ? `<span class="chip">v${esc(a.version)}</span>` : ""}${ci}${zip}
      <span class="chip ${gameLight}">in game: ${game}</span>
    </div>
    ${a.readiness.reasons.length ? `<ul class="reasons ${a.readiness.light === "red" ? "red" : ""}">${a.readiness.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
    <ul class="checks">${a.checks
      .map(
        (c) => `<li class="check"><div class="row"><div><div class="look">${esc(c.look)}</div><div class="oks">${esc(c.ok)}</div></div>
          <div class="tri" role="group" aria-label="${esc(c.look)}"><button data-act="tick" data-key="${esc(a.id)}/${esc(c.id)}" data-v="ok" class="${c.tick === "ok" ? "on-ok" : ""}" aria-pressed="${c.tick === "ok"}">ok</button><button data-act="tick" data-key="${esc(a.id)}/${esc(c.id)}" data-v="broken" class="${c.tick === "broken" ? "on-broken" : ""}" aria-pressed="${c.tick === "broken"}">broken</button></div></div>
          ${c.tick === "broken" ? `<div class="todo"><b>If it's broken:</b> ${esc(c.todo)}<div class="fix">Fixed by: ${esc(c.fix)}</div><button class="btn sm" data-act="note-for" data-addon="${esc(a.id)}" data-text="${esc(c.look)}: ">Write a note</button></div>` : ""}</li>`,
      )
      .join("")}</ul>
    <div class="risk">${esc(a.risk)}</div>
    <div class="tools"><button class="btn sm ghost" data-act="store-dry" data-repo="${esc(a.id)}">Store page dry run</button></div>
  </section>`;
}

function steps() {
  return S.timeline
    .map(
      (t) => `<li class="step ${t.done ? "done" : ""} ${t.next ? "next" : ""} ${t.past ? "past" : ""}"><input type="checkbox" data-act="step" data-id="${esc(t.id)}" ${t.done ? "checked" : ""} aria-label="${esc(t.title)}"><div><div class="when">${esc(when(t.at))}${t.next ? " · next" : ""}</div><div class="t">${esc(t.title)}</div><div class="d">${esc(t.detail)}</div></div></li>`,
    )
    .join("");
}

function questions() {
  return S.questions
    .map(
      (q) => `<div class="q"><div class="top"><input type="checkbox" data-act="answer-done" data-id="${esc(q.id)}" ${q.done ? "checked" : ""} aria-label="${esc(q.title)}"><span class="t">${esc(q.title)}</span></div>
      <div class="ask">${esc(q.ask)}</div><div class="okq">${esc(q.ok)}</div>
      <input type="text" data-act="answer-text" data-id="${esc(q.id)}" value="${esc(q.text)}" placeholder="What you saw" maxlength="1000" aria-label="Answer: ${esc(q.title)}"></div>`,
    )
    .join("");
}

function light(l, text, reasons) {
  return `<span class="dot ${l}"></span><div><div class="l">${esc(text)}</div><div class="r">${reasons.length ? reasons.map((r) => `<div>${esc(r)}</div>`).join("") : "all clear"}</div></div>`;
}

function systems() {
  const b = S.build;
  const cards = S.board.cards;
  return `<div class="sys">
    ${light(b.light, "Forever build", b.reasons)}
    ${light(S.chain.light, "Data chain", S.chain.reasons)}
    ${light(S.infra.light, "Site and inbox", S.infra.reasons.length ? S.infra.reasons : (S.infra.probes ?? []).map((p) => `${p.name} ${p.status} · ${p.ms} ms`))}
    ${light(S.board.light, "Board", S.board.reasons)}
    ${light(S.sources.light, "Readings", S.sources.reasons)}
  </div>
  ${cards.length ? `<div style="margin-top:12px">${cards.map((c) => `<div class="hint" style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:4px"><span>${esc(c.title)}</span><select class="mini" data-act="card" data-id="${esc(c.id)}" aria-label="Status of ${esc(c.title)}">${["running", "blocked", "waiting-test", "waiting-review", "ready-to-push", "done"].map((s) => `<option ${s === c.status ? "selected" : ""}>${s}</option>`).join("")}</select></div>`).join("")}</div>` : ""}`;
}

function data() {
  const d = S.data;
  if (d.error && !d.zones) return `<div class="hint">${esc(d.error)}</div>`;
  const k = d.kinds ?? {};
  return `<table class="kv">${(d.zones ?? []).map((z) => `<tr><td>${esc(z.zone)} quests</td><td style="color:${z.quests ? "var(--parchment)" : "var(--faint)"}">${z.quests}</td></tr>`).join("")}
    <tr><td>Factions</td><td>${k.faction ?? "?"}</td></tr><tr><td>Creatures</td><td>${k.creature ?? "?"}</td></tr><tr><td>Quests in all</td><td>${k.quest ?? "?"}</td></tr></table>
    <div class="hint" style="margin-top:8px">forever.db built ${esc((d.builtAt ?? "").slice(0, 10))} at build ${esc(d.pins ?? "?")}. These are what Codex wave 2 and Goodwill's Forever factions wait on.</div>`;
}

function notes() {
  const list = S.notes
    .slice()
    .reverse()
    .map((n) => `<div class="note"><div class="m"><span class="sev ${esc(n.severity)}">${esc(n.severity)}</span><b style="color:var(--parchment)">${esc((S.addons.find((a) => a.id === n.addon) ?? { name: n.addon }).name)}</b><span>${esc(hhmm(n.at))}</span><button class="btn sm ghost" style="margin-left:auto" data-act="drop" data-id="${esc(n.id)}" aria-label="Delete note">✕</button></div>${esc(n.text)}${n.shot ? `<img src="/shot?k=${encodeURIComponent(KEY)}&f=${encodeURIComponent(n.shot)}" alt="screenshot" loading="lazy">` : ""}</div>`)
    .join("");
  return list || '<div class="hint">Nothing broken yet.</div>';
}

function shots() {
  const sig = JSON.stringify([S.shots.list.map((s) => s.name), shot, S.shots.error]);
  if (sig === lastShots) return;
  lastShots = sig;
  const box = $("#shots");
  if (S.shots.error) box.innerHTML = `<div class="hint">${esc(S.shots.error)}</div>`;
  else if (!S.shots.list.length) box.innerHTML = '<div class="hint">No screenshot in iCloud Drive since an hour before launch.</div>';
  else box.innerHTML = `<div class="shots">${S.shots.list.map((s) => `<button type="button" data-act="shot" data-f="${esc(s.name)}" class="${shot === s.name ? "sel" : ""}" aria-label="Attach ${esc(s.name)}" aria-pressed="${shot === s.name}"><img src="/shot?k=${encodeURIComponent(KEY)}&f=${encodeURIComponent(s.name)}" alt="${esc(s.name)}" loading="lazy"></button>`).join("")}</div>`;
}

// (a field being typed in is left alone, so a refresh never eats a word)
const typing = (el) => el && el.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && document.activeElement.type !== "checkbox";
function put(sel, html) {
  const el = $(sel);
  if (!typing(el)) el.innerHTML = html;
}

// (the redraw replaces the buttons, so the one the keyboard is on is found again and focused)
function focusKey() {
  const el = document.activeElement;
  if (!el?.dataset?.act) return null;
  // (every data attribute but the note's prefilled text: a button is told apart by its repo, file or addon too)
  return [...el.attributes].filter((a) => a.name.startsWith("data-") && a.name !== "data-text").map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join("");
}

function render() {
  const keep = focusKey();
  band();
  put("#cards", S.addons.map(card).join(""));
  put("#steps", steps());
  put("#questions", questions());
  put("#systems", systems());
  put("#data", data());
  put("#notes", notes());
  $("#age-systems").innerHTML = `build ${age("build")} · runs ${age("remote")} · probes ${age("infra")} · preflight ${age("preflight")}`;
  $("#age-data").innerHTML = age("data");
  const sel = $("#n-addon");
  if (!sel.options.length) sel.innerHTML = S.addons.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("") + '<option value="other">Something else</option>';
  shots();
  if (keep) $(keep)?.focus({ preventScroll: true });
}

// ── doing ───────────────────────────────────────────────────────────────────
async function load() {
  try {
    S = await api("/api/state");
    offset = S.now - Date.now();
    lastOk = Date.now();
    render();
  } catch (e) {
    tickClock();
  }
}
async function change(body) {
  try {
    await api("/api/change", body);
    await load();
  } catch (e) {
    alert(e.message);
  }
}
function modal(title, text) {
  let m = $("#veil");
  if (!m) {
    m = document.createElement("div");
    m.id = "veil";
    m.className = "veil";
    document.body.append(m);
    m.addEventListener("click", (e) => (e.target === m || e.target.closest("[data-close]")) && m.remove());
  }
  m.innerHTML = `<div class="panel modal" role="dialog" aria-modal="true"><div class="mh"><h2>${esc(title)}</h2><button class="btn ghost sm" data-close aria-label="Close">✕</button></div><pre>${esc(text)}</pre></div>`;
}

document.addEventListener("keydown", (e) => e.key === "Escape" && $("#veil")?.remove());
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act]");
  if (!t || t.tagName === "SELECT" || t.tagName === "INPUT") return;
  const d = t.dataset;
  if (d.act === "tick") return change({ op: "tick", key: d.key, value: t.classList.contains("on-" + d.v) ? "untested" : d.v });
  if (d.act === "drop") return change({ op: "drop", id: d.id });
  if (d.act === "refresh-all") {
    t.disabled = true;
    await Promise.all(S.applicable.map((s) => api("/api/refresh", { source: s }).catch(() => {})));
    return load();
  }
  if (d.act === "shot") {
    shot = shot === d.f ? null : d.f;
    lastShots = "";
    return shots();
  }
  if (d.act === "note-for") {
    $("#n-addon").value = d.addon;
    $("#n-sev").value = "bug";
    const ta = $("#n-text");
    ta.value = ta.value || d.text;
    ta.focus();
    return ta.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  if (d.act === "store-dry") {
    modal(`Store page dry run: ${d.repo}`, "Reading CurseForge, Wago and GitHub. Nothing is saved…");
    try {
      const r = await api("/api/action", { name: "store-dry", repo: d.repo });
      modal(`Store page dry run: ${d.repo}`, (r.ok ? "" : "(exit non-zero)\n") + r.out);
    } catch (err) {
      modal("Store page dry run", err.message);
    }
  }
});
document.addEventListener("change", async (e) => {
  const t = e.target;
  const d = t.dataset;
  if (d.act === "step") return change({ op: "step", id: d.id, done: t.checked });
  if (d.act === "answer-done") return change({ op: "answer", id: d.id, done: t.checked, text: $(`input[data-act=answer-text][data-id="${d.id}"]`).value });
  if (d.act === "answer-text") return change({ op: "answer", id: d.id, done: $(`input[data-act=answer-done][data-id="${d.id}"]`).checked, text: t.value });
  if (d.act === "card") {
    try {
      const r = await api("/api/action", { name: "card", id: d.id, status: t.value });
      if (!r.ok) modal("Board", r.out);
    } catch (err) {
      modal("Board", err.message);
    }
    return load();
  }
});
$("#nform").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("#n-text").value.trim();
  if (!text) return;
  await change({ op: "note", addon: $("#n-addon").value, severity: $("#n-sev").value, text, ...(shot ? { shot } : {}) });
  $("#n-text").value = "";
  shot = null;
  lastShots = "";
});
$("#copy-notes").addEventListener("click", () => {
  const b = $("#copy-notes");
  const said = (t, ms) => {
    clearTimeout(b.timer);
    b.textContent = t;
    b.timer = setTimeout(() => (b.textContent = "Copy the notes command"), ms);
  };
  navigator.clipboard.writeText("bun addon-kit/launch.ts notes").then(() => said("Copied", 1500), () => said("Not copied: bun addon-kit/launch.ts notes", 8000));
});

load();
setInterval(load, 15000);
setInterval(tickClock, 1000);
