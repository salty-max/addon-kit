/**
 * Launch night's page, as one HTML document (launch.ts serves it): the markup
 * here, the look in launch-page.css, the drawing in launch-page.js. No build
 * step. The key rides in the script, so another site open in the browser
 * can't press a button.
 */
import css from "./launch-page.css" with { type: "text" };
import js from "./launch-page.js" with { type: "text" };

export function page(key: string, demo: boolean): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Forever launch night</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<style>${css}</style></head><body>
<div class="stale" id="stale" hidden>Lost the server. Start it again: bun addon-kit/launch.ts</div>
<div class="wrap">
<h1 class="sr">Forever launch night</h1>
<header class="panel band" id="band"><div id="clock" class="clock"><span>T−0:00:00</span></div></header>
<div class="cols">
  <main><div class="cards" id="cards" aria-label="The nine addons"></div></main>
  <aside class="side">
    <section class="panel box"><h2 class="sec">Timeline</h2><ol class="steps" id="steps"></ol></section>
    <section class="panel box"><h2 class="sec">Systems <span class="age" id="age-systems"></span></h2><div id="systems"></div></section>
    <section class="panel box"><h2 class="sec">What broke</h2>
      <form class="nform" id="nform">
        <div class="line"><select id="n-addon" aria-label="Addon"></select><select id="n-sev" aria-label="Severity"><option value="bug">bug</option><option value="blocker">blocker</option><option value="nit">nit</option></select></div>
        <textarea id="n-text" placeholder="What you saw, what you did, the error text" aria-label="What broke"></textarea>
        <div id="shots"></div>
        <div class="line"><button class="btn gold" type="submit">Add the note</button><button class="btn ghost" type="button" id="copy-notes">Copy the notes command</button></div>
      </form>
      <div id="notes" style="margin-top:10px"></div>
    </section>
    <section class="panel box"><h2 class="sec">Open questions</h2><div id="questions"></div></section>
    <section class="panel box"><h2 class="sec">Forever data <span class="age" id="age-data"></span></h2><div id="data"></div></section>
  </aside>
</div>
</div>
<script>const KEY=${JSON.stringify(key)};const DEMO=${demo ? "true" : "false"};${js}</script></body></html>`;
}
