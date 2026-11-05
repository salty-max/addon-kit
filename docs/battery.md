# The test battery

An addon's tests play it in a mock of the game (`wowmock.lua`). The mock used to accept any call, so a call the
client refuses passed (5 November 2026: Primer's `GameTooltip:SetTalent` in Era's argument order raised "bad
argument #3" on Forever, in the player's game only). The battery makes the mock refuse what the client refuses,
plays every window and state, and feeds Forever's secret values to every call. It is Primer's (its commit
`31518c6`), moved into the kit so every addon runs the same one. Primer's own `docs/testing.md` is the worked
example, and says what the battery found there.

## What the kit holds

| Kit file | Copied to | What it is |
|---|---|---|
| `wowmock.lua` | `addon/test/` | the test game itself (frames, events, timers, the character) |
| `strict.lua` | `addon/test/` | wraps the mock's functions and widget methods so a call Blizzard's documentation refuses raises, naming the function and the argument, and is also kept in `violations` (a `pcall` cannot hide it) |
| `secrets.lua` | `addon/test/` | secret values (a userdata that keeps its type and raises on indexing, `#`, `pairs`, arithmetic, concatenation, ordering, calling), `issecretvalue`, and the driver that answers each call of the game with them |
| `battery.lua` | `addon/test/` | what a matrix is made of: frames that know their children and regions, the walk of what is shown, the audits (size, place, words, pictures, cut text, faults, refusals), the hover and click of everything shown, the failure list and the verdict |
| `strict_test.lua` | `addon/test/` | the strict game's own test (a bad `SetSize` must be refused...), then the addon's `addon/test/strict_extra.lua` |
| `battery-lib.ts` | `scripts/` | the runner: the addon's jobs at once, one verdict line each |
| `apidocs.ts`, `apidocs-dump.lua` | not copied, run from the kit | the generator: `addon/test/api_<game>.lua` and `evidence_<game>.lua` from Blizzard's pinned API documentation (`wow-data/ui-pins.json`), for the calls the addon's own Lua makes |

`kit:sync` copies `wowmock.lua` beside a `game.lua` that names it, the four other test files beside one that names `strict.lua`, and `battery-lib.ts` beside a
`scripts/battery.ts`, so an addon that has not joined the battery gets nothing. Its stamp covers them all: a change
to any makes every addon's copy stale until `kit:sync`.

## Joining the battery (the steps)

1. In `addon/test/game.lua`, after the addon's own world and before `G.load`:
   ```lua
   local B = dofile("addon/test/battery.lua")
   B.track(G)                                   -- frames know their children and regions
   if G.FOREVER then dofile("addon/test/secrets.lua").install(G, state.secrets) end  -- issecretvalue, before Kit.lua reads it
   if os.getenv("STRICT") ~= "0" then
     G.strict = dofile("addon/test/strict.lua")
     G.strict.install(G, G.FOREVER and "forever" or "classic")
     -- G.strict.ALLOW["GameTooltip:Method"] = "who saw it work in the game, when"  (never to make a run green)
   end
   ```
   (`state.secrets` is the table `issecretvalue` reads: `state.secrets = {}` on Forever.) A matrix that plays with
   secret values (or `type` patched) needs the addon's game.lua to call a hook before `G.load`, as Primer's does
   (`if PRIMER_BEFORE_LOAD then PRIMER_BEFORE_LOAD(G) end`), because an addon keeps a copy of the globals it uses.
2. `bun scripts/root.ts --run addon-kit/apidocs.ts` writes the four tables (in `package.json`: `apidocs`,
   `apidocs:check`, the latter in `check`). It reads every Lua file under `addon/` except `test/`, `Text_*` and
   anything that says GENERATED in its first lines. Rerun after a new Blizzard call, and after a pin moves. The tables carry a key of what they were made from (the
   pin, what the addon calls, the two generator files): `--check` that finds the same key returns at once, and any
   other change takes about 25 seconds, Blizzard's whole documentation read again.
3. `scripts/battery.ts` lists the jobs for `runBattery` (see `battery-lib.ts`), and `check` runs it.
4. `addon/test/matrix.lua`, from the template below.
5. `bun run kit:sync`, `bun run apidocs`, `bun scripts/battery.ts`. The first run shows every call the mock lets
   through that the client does not. Fix what is the addon's (a guard before use, `K.secret`, `pcall`). A refusal
   that is the mock's gap (a function the mock lacks or answers wrongly) is the mock's to fix, not the addon's.

## A game of its own

An addon whose `game.lua` is its own mock (Hearthtale's, Second Wind's and Keyring's are, not built on
`wowmock.lua`) can still use the strict layer: `S.install({ FOREVER = ... }, game)` wraps the documented functions
(the `C_*` namespaces and the global functions) and builds the tables, but there is no `G.methods` to wrap, so the
mock calls `S.method(name, frame, ...)` itself wherever a frame answers a method call (Hearthtale's `ui()` does,
once `strictMethod` is set). The tooltip wrapping and the refusal of an unknown method name are for the kit's mock
only. A frame needs `kind` (and `name`) set, so a refusal can name it. The cost is the mock's: a mock that answers
any method with something (a `GetPoint` that returns the frame) hides what the strict layer does not see, so it is
made to answer as the client does where the strict game shows it matters.

## The matrix, a template

The matrix is the addon's: its windows, its tabs, its characters, its events. The kit gives it the rest.

```lua
local MODE = arg and arg[1] or "matrix"
local X = dofile("addon/test/secrets.lua")
if MODE == "secrets" then MYADDON_BEFORE_LOAD = function() X.patchType() end end  -- game.lua calls it before G.load
local G = dofile("addon/test/game.lua")
local s, ns = G.state, G.ns
local started = os.clock()

local B = dofile("addon/test/battery.lua")
B.trackTextures(G)
B.shownByDefault()
local b = B.new({
  G = G,
  name = "MyAddon",
  roots = function() return MyWindow and { MyWindow } or {} end,   -- the windows to walk
  skip = function(f) return f == MyWindow.CloseButton end,          -- hover and click leave these alone
  faults = function() local f = ns.faults; ns.faults = {}; return f end,   -- optional: what the addon kept
  -- cut = function() return ns.fit() end,   cutOk = { [text] = "why a person judged it fine" },
  -- badPicture = function(region) return region.texture == "Interface\\Icons\\INV_Misc_QuestionMark" end,
  -- rules = { ascii = false }   -- a language with accents
})

local function play(case, setup)
  if not b.try(case, "setup", setup) then return end
  for _, tab in ipairs({ 1, 2, 3 }) do
    local label = case .. ", tab " .. tab
    if b.try(label, "open", MyAddonOpen, tab) then
      G.advance(0.5)
      b.audit(label)
      b.touch(label)
      b.audit(label .. " (after clicks)")
    end
  end
  b.try(case .. ", events", "an event", function() G.fire("PLAYER_LEVEL_UP", 11) G.advance(0.5) end)
  b.audit(case .. ", events")
end

G.login()
if MODE == "secrets" then
  X.drive(G, {
    globals = { "UnitName", "UnitGUID", "UnitClass" },
    each = function(label) play(label, function() end) end,
  })
else
  for level = 1, 60, 10 do play("level " .. level, function() s.level = level end) end
end
b.finish(("✓ matrix: %d hovers, %d clicks, %d words (%.1fs)"):format(b.hovers, b.clicks, b.texts, os.clock() - started))
```

A case fails on: a Lua error, a fault the addon kept, a call the strict game refused, a frame bigger than the
screen or a window anchored off it, text cut short, a semicolon, an exclamation mark or a non-ASCII character in a
word shown, a picture the addon marks bad. Primer's `matrix.lua` adds what its pages need (classes, levels, the
talent calls that must leave nothing read, reads in combat).

## The secrets run

`X.drive` replaces, one at a time, each function of every `C_*` namespace (not `C_Timer`) and the globals the
matrix names, with a version that answers with secret values: whole (one secret per value) and field by field (a
plain table, every value in it secret). `each(label, name, whole)` plays the addon while it is so, and the failures
go to `b.fail`. A guard that only checks `issecretvalue(x)` on the top value passes the whole run and fails the
fields run, which is why both are played. Era has no secret values: `X.drive` says so and ends (the addon's own steps before it still run).

## Options worth knowing

- `B.new{ rules = { ascii = false, allow = { "\194\183" } } }`: what a word shown must not hold. `allow` takes out
  signs the interface uses on purpose (Hearthtale's middle dot between an entry's title and its line).
- `unanchored = function(window)`: windows the game places (a banner in the alert stack) are not audited for
  their anchor.
- `X.drive(G, { strict = G.strict, flaggedOnly = true, ... })`: only the calls Blizzard's documentation itself flags
  as secret (`SecretReturns`, `SecretWhen*`), the ones the client really hides. The default goes further than the
  flags, every call of the game, which is what Primer runs: a guard for a call nobody documents as secret is a
  guess, and a matrix with `SECRETS=all` (Hearthtale's) shows what the guess would cost.
- `TRACE=2000` keeps that many characters of a failure's traceback. A secret value used by the addon names the
  first Lua line outside `secrets.lua` that did it, even from `tostring` or a format (when the mock does the
  using, the mock's line: the longer trace shows the rest).
- `kindOf`: how failures are grouped in the report. The default drops the case, so one cause in a hundred cases
  prints once. A secrets run keeps the call in the key.
- The battery lets its own `GetScale` through the strict game while it audits a window, and only then.

## What it cannot cover

- **The documentation is Blizzard's declaration, not the client.** It lists the longest form of some methods
  (`SetPoint("TOP")` is fine, `SetPoint("LEFT", 4, 0)` is not listed): `OPTIONAL_FROM` and `EXTRA_SIGNATURES` in
  `strict.lua` are the places it is loosened. A string enum's values are checked as strings only. Types the
  documentation does not define are counted as unchecked and printed at the end of a sim.
- **The source is a few builds behind the client** (`wow-data/docs/ui-source.md`). A method Blizzard's Lua never
  calls may still exist, and a call it makes may still fail.
- **Methods are matched by name, not by widget.** `frame:SetText()` on a plain Frame passes if any widget
  documents `SetText`. Enum arguments accept numbers or strings, function arguments accept tables.
- **Globals the documentation lacks** (`CreateFrame`, `PlaySound`...) are not checked.
- **Widget scripts and templates** (`SetScript` events, `UIPanelButtonTemplate`) are not checked.
- **No layout.** Size against the screen and a window's anchor are checked, overlaps, clipping, the look and the
  fonts are not. Text width is an estimate (0.55 of the size a character).
- **Secret values are emulated.** The documentation flags few returns; the run goes further on purpose.
- **Events and timing** are the mock's: an addon's matrix fires its events by hand.
- **Taint**: nothing here sees it.
- **A mock that lacks a function the addon calls** answers with nothing, as a lenient mock does: the call is
  unchecked. `S.report()` prints the unchecked names at the end of a sim.
