# Controller support (Forever only)

The user's call of 6 November 2026: controller support is for WoW Forever only, Classic Era has no native
controller support. The research is `ideas/controller-support.md` (family folder). What the kit does:

- **Tells the Gamepad UI the windows exist.** Forever's Gamepad UI walks the D-pad across the buttons of the
  windows its `GamepadMode.FrameControlsManager` knows. `K.movable` (every kit window; the book and the welcome
  dialog do it themselves, right after their own `SetScript`, see the end) hooks, through `K.padHook`, OnShow and OnHide and calls `FrameShown(window)` and `FrameHidden(window)` as Blizzard's own
  windows do (`FloatingChatFrame.lua`, `ReportFrameShared.lua`, `Blizzard_SecureTransferUIOutbound.lua`). The
  manager does nothing while the Gamepad UI is off, and on Era there is no `GamepadMode`, so `padCall` returns
  before any call (nothing is created either). The call goes through `securecallfunction` (as Blizzard's popup code
  does), behind `pcall`. That does not make it secure: our hook runs it, so the manager's tables take our taint (not
  verified in the game: `blocked` in the trace counts it).
  Source read: the pinned Forever build 1.60.1.70532 (a few builds behind the client). The manager has no
  combat check, but both calls end in `SetOverrideBinding`, which the game refuses in combat and would leave the
  manager's flags wrong: in combat the call waits (`waiting` in the trace) and is made when the fight ends.
- **Not done**: a window already shown when the Gamepad UI switches on is not registered until its next showing
  (Blizzard re-registers its own through `InputUtil.RegisterGamepadInit`, which would run our code inside its
  transition handler: left alone). A focus ring of our own for Era, stick scrolling on Era, text
  input by pad. (Opening by a pad button is done: the next section.)
- **Small fixes for everyone**: `K.HIT_X` (4) grow a row's and a chip's click sideways by 4 (they touch, so not up or down), a button's (3 and
  2), an item's (2); the scroll thumb follows `OnVerticalScroll` (the stick scrolls with `SetVerticalScroll`);
  `K.dialog` and `K.gameWindow` carry `.CloseButton` (the Gamepad UI closes a window by it); an item's tooltip
  and a chip's line show on a click too (Smart Navigation focuses, it does not hover).

## Opening by a pad button

The user's call of 6 November 2026, after `ideas/controller-support.md` item 1. A pad player has no keyboard for
`/yonder`, and the minimap button is a 31 pixel target the virtual cursor must be steered to. So every addon
declares one key binding, "Open <the addon>", under its own heading in the game's Key Bindings. The player puts any
key or pad button on it once, and one press opens or closes the window.

**Why this changes a family habit.** The family had no `Bindings.xml` before: a slash command and a minimap button
were enough for a keyboard and a mouse, and a binding is one more file to keep right. A pad has neither, so the file
is the front door and the only one a pad reaches without a cursor. It costs nothing to a player who never uses it: a
binding with no key set does nothing at all: no key reaches it, and the addon sets none. Era gets the file too, since a keyboard key on Era is as useful.

### What the game does (read in Blizzard's source, both games)

Pinned builds: Era 1.15.9.70576 (exact), Forever 1.60.1.70532 (a few builds behind the client). Through
`bun wow-data/bin/ui.ts find …` and the files under `wow-data/.cache/github/Gethe/wow-ui-source/`.

- **The pad is heard on the binding screen, in both games.** `Blizzard_Settings_Shared/Blizzard_Keybindings.lua`
  lines 7 and 29 are the same in Era and Forever: the listener sets `OnGamePadButtonDown` beside `OnKeyDown` and
  `OnMouseWheel` while it waits for the new key, and `ProcessInput` takes the button as it does a key
  (`GetConvertedKeyOrButton`). So a pad button can be bound on Era as well as on Forever. Whether the *engine* sends
  pad buttons to the game on Era at all depends on its `GamePadEnable` setting (the engine's, not in the Lua):
  not verified, see the list at the end.
- **A binding's heading is its `category`.** Both binding screens (Era's `Blizzard_SettingsDefinitions_Frame/Keybindings.lua`,
  Forever's, the same code) group a binding by the `category` `GetBinding` returns, read as a global name
  (`GetBindingCategoryName`: `_G[cat]` if it is a string, else the text itself). A binding with no category lands
  under "Other". Blizzard's own files do exactly this (`category="BINDING_HEADER_COMMENTATOR"`,
  `category="BINDING_HEADER_INTERFACE"`). So `category="BINDING_HEADER_<KEY>"` and a global
  `BINDING_HEADER_<KEY> = "Yonder"` give the addon a section of its own.
- **The label is `BINDING_NAME_<ACTION>`**, a global read by the screen through `GetBindingName`.
- **The old and the new binding screens.** Era 1.15 still carries the old one (`Blizzard_BindingUI`, an options-list
  with `_G[category] or category`: the same rule) beside the new Settings one above. Forever has only the Settings
  one. The file works for both: the category is the only thing either reads.
- **`Bindings.xml` is not in a TOC.** Blizzard's own (`Blizzard_Commentator/Bindings.xml`,
  `Blizzard_Gamepad/Bindings.xml`) are not listed by their TOCs; the game loads the file from the addon's folder by
  itself (the engine's, not in the Lua: the packager and `bindings.ts` check that we do not list it).
- **The body is Lua, run on the key's press** in the global environment: so it calls one global function the addon
  defines. A binding's `bindingContext` is for Forever's own Gamepad modes (`Blizzard_Gamepad/Bindings.xml`); ours
  has none, like Blizzard's Interface bindings (`TOGGLEGROUPFINDER` and the others), so it works wherever those do.

### What the kit does

`K.binding({ key, name, global, toggle, outOfCombat, prefix })` (`Kit.lua`, "the key binding") sets
`BINDING_HEADER_<KEY>` (the addon's name), `BINDING_NAME_<KEY>_OPEN` (`L["Open %s"]`: "Open Yonder" / "Ouvrir Yonder")
and the global function the file calls. It runs after the language file, in every TOC (the check says so).

The toggle is the minimap button's click, the same function (`ns.toggle`, so the binding, the button, `/yonder` and
Keyring all open and close the window one way). It is a plain frame: the game lets any addon show one in combat, so
nothing is "forbidden". A toggle that raises goes to the game's error handler.

**In combat.** The window opens as the button does, fight or not, except for an addon whose rule is that it reads
nothing in combat. Primer is the one (`outOfCombat = true`): in a fight the press opens nothing and says one line,
"Primer opens once the fight is over." (at most every five seconds, so a button held down does not fill the chat).
Second Wind's "nothing in combat" is about its own alerts and debrief, not a window the player asks for.

### The addon's side

`addon/<Name>/Bindings.xml`, four lines:

```xml
<Bindings>
	<Binding name="YONDER_OPEN" category="BINDING_HEADER_YONDER">
		YonderBinding();
	</Binding>
</Bindings>
```

and, once, after the minimap button in its Lua:

```lua
ns.kit.binding({
  key = "YONDER", name = "Yonder", global = "YonderBinding",
  toggle = function() ns.toggle() end, prefix = ns.PREFIX,
})
```

(Keyring, which has no kit, sets the three globals by hand: `BINDING_HEADER_KEYRING`, `BINDING_NAME_KEYRING_OPEN`
and its function, declared in its selene globals file.) The packager needs nothing: it ships every file git carries
(`package-lib.ts`), and refuses a TOC that lists `Bindings.xml`.

### The check

`bun addon-kit/bindings.ts check <repository…>` (from an addon: `bun scripts/root.ts --run addon-kit/bindings.ts
check addon/Yonder`, which each addon's `check` runs once its binding is in): the file is there with exactly one binding named
`<KEY>_OPEN` whose category is `BINDING_HEADER_<KEY>` and whose body is one call; the Lua declares the same key and
function (the kit's call, or the three by hand), with a name and a toggle, after the language file; no TOC lists
the file, git carries it, `.pkgmeta` does not ignore it. Tests: `bindings.test.ts`, `test.lua` ("The key binding").

### What a player does

1. Game menu, Options, Key Bindings (on Forever: Options, Keybindings).
2. Find the addon's heading ("Yonder"), the line "Open Yonder".
3. Click the line's box (with a pad on Forever, the Gamepad UI's focus ring and its face button should do it: not
   verified), then press the key or pad button wanted. The screen listens to both.
4. Press it in the game: the window opens, press it again: it closes.

### Not verified in the game

- That the engine sends pad buttons to the Lua on Era (the `GamePadEnable` setting) and that the binding screen
  shows the pad button's name, not a blank. The pad listener is in Blizzard's Lua in both games, the engine side
  is not. Probe, on Era with a pad and `GamePadEnable 1`: bind a pad button, press it.
- That Forever lists a binding with a plain default context while the Gamepad UI is on (Blizzard's own
  Interface bindings do the same). Probe: bind a pad button, press it with the Gamepad UI on.
- That a pad button is not swallowed by the focus ring of an open window (Smart Navigation reads the face
  buttons). Probe: with the window open, press the bound button: it should close it.
- That `Bindings.xml` needs no TOC line (the engine's rule; Blizzard's TOCs agree, the game decides).

## The trace

`/<addon> pad` (any addon using `K.commands`, not in the usage) prints one line, from `K.padReport()`:

`Controller: Gamepad UI on, manager found, told shown 1, hidden 1, raised 0, blocked 0, waiting 0`

- `Gamepad UI`: `InputUtil.IsGamepadUIEnabled()` (on, off, unknown), `manager`: found or absent (Era: absent).
- `told shown/hidden`: calls that returned without raising. `raised N (words)`: calls that raised, the last
  one's error. `blocked`: ADDON_ACTION_BLOCKED / ADDON_ACTION_FORBIDDEN events naming this addon (the taint
  worry: not verified in the game, this counts it). `raised` is a lower bound (`securecallfunction` may hand an
  error to the game's handler). `waiting`: windows held back by a fight.
- The line is English, a diagnosis for us.

Tests: `test.lua`, the block "The controller".

## Not verified in the game

- The book's first tab is built before the manager is told. The book and the welcome set their own OnShow and
  OnHide with `SetScript` (as before), which in the game drops every hook on the window, so they say `kitPadLate`
  before `K.movable` (which then leaves the hooks) and call `K.padHook(window)` right after their own `SetScript`:
  the Gamepad UI's hooks are the last, and `FrameShown` runs after `B:show` has built the first tab. Whether
  Blizzard's `FrameShown` then sees the rows is still for a person with the Gamepad UI on: open a book for the first
  time after a reload and see whether the ring reaches the rows (the `/<addon> pad` line says the call ran, not
  what it saw). Tests: `test.lua`, "pad: the book's own OnShow runs before FrameShown", and the welcome's order.
