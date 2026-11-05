/**
 * The battery's runner (the kit's copy, kit:sync: edit addon-kit's battery-lib.ts): an addon's test jobs run at
 * once, one verdict line each, the failures' last lines under a red one. The jobs are the addon's, in its
 * scripts/battery.ts:
 *
 *   import { runBattery } from "./battery-lib";
 *   const jobs = [];
 *   for (const forever of [false, true]) {
 *     jobs.push({ name: "sim", forever, args: ["addon/test/sim.lua"] });
 *     jobs.push({ name: "strict", forever, args: ["addon/test/strict_test.lua"] });
 *     jobs.push({ name: "matrix", forever, args: ["addon/test/matrix.lua"] });
 *   }
 *   jobs.push({ name: "matrix secrets", forever: true, args: ["addon/test/matrix.lua", "secrets"] });
 *   await runBattery(jobs);          // bun scripts/battery.ts [part of a job's name]
 *
 * A job is one luajit run in the addon's folder with FOREVER=1 or 0 (env adds more). Its verdict is the last line
 * that starts with a tick. The wall time is the slowest job's, as they are independent.
 */
import { resolve } from "node:path";

export type Job = { name: string; forever: boolean; args: string[]; env?: Record<string, string> };

export async function runBattery(jobs: Job[], opts: { cwd?: string; only?: string } = {}): Promise<never> {
  const cwd = opts.cwd ?? resolve(import.meta.dir, "..");
  const only = opts.only ?? process.argv[2];
  const started = Date.now();
  const runs = jobs
    .filter((j) => !only || j.name.includes(only))
    .map(async (job) => {
      const proc = Bun.spawn(["luajit", ...job.args], {
        cwd,
        env: { ...process.env, ...job.env, FOREVER: job.forever ? "1" : "0" },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      const code = await proc.exited;
      return { job, code, out: out.trim(), err: err.trim() };
    });

  let failed = false;
  for (const r of await Promise.all(runs)) {
    const label = `${r.job.name} (${r.job.forever ? "Forever" : "Classic Era"})`;
    if (r.code === 0) {
      const verdict = r.out.split("\n").filter((l) => l.startsWith("✓")).pop() ?? r.out.split("\n").pop();
      console.log(`${verdict}`);
    } else {
      failed = true;
      console.log(`✗ ${label} failed`);
      console.log([r.out, r.err].filter(Boolean).join("\n").split("\n").slice(-40).join("\n"));
    }
  }
  console.log(`${failed ? "✗" : "✓"} battery: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  process.exit(failed ? 1 : 0);
}
