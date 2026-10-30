// The batch files keep CRLF endings (bun test): cmd.exe's label search
// (`goto :end`) fails on an LF-only file, and every iCloud installer is a
// copy of this one. A file written after checkout keeps LF while git calls
// it clean, so the check reads the working copy, not the index.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The 1-based numbers of the lines that end in a bare LF. */
export function bareLines(text: string): number[] {
  const bare: number[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length - 1; i++) if (!lines[i].endsWith("\r")) bare.push(i + 1);
  return bare;
}

const CMD = readdirSync(import.meta.dir).filter((name) => name.endsWith(".cmd"));

describe("batch files", () => {
  test("a bare LF is found", () => {
    expect(bareLines("@echo off\r\necho hi\r\n")).toEqual([]);
    expect(bareLines("@echo off\necho hi\r\n:end\n")).toEqual([1, 3]);
    expect(bareLines("no line break")).toEqual([]);
  });

  test("the batch files are found", () => expect(CMD).toContain("install.cmd"));

  for (const name of CMD)
    test(`${name} ends every line in CRLF`, () => {
      const bare = bareLines(readFileSync(join(import.meta.dir, name), "utf8"));
      // On a failure: rm windows/install.cmd && git checkout windows/install.cmd
      expect(bare).toEqual([]);
    });
});
