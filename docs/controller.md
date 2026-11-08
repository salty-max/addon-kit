# Controller support (Forever only)

The user's call of 6 November 2026: controller support is for WoW Forever only, Classic Era has no native
controller support. The research is `ideas/controller-support.md` (family folder). What the kit does:

- **Tells the Gamepad UI the windows exist.** Forever's Gamepad UI walks the D-pad across the buttons of the
  windows its `GamepadMode.FrameControlsManager` knows. `K.movable` (every kit window; the book and the welcome
  dialog do it themselves, right after their own `SetScript`, see the end) hooks, through `K.padHook`, OnShow and OnHide and calls `FrameShown(window)` and `FrameHidden(window)` (only for a window it was told shown) as Blizzard's own
  windows do (`FloatingChatFrame.lua`, `ReportFrameShared.lua`, `Blizzard_SecureTransferUIOutbound.lua`). The
  manager does nothing while the Gamepad UI is off, and on Era there is no `GamepadMode`, so `padCall` returns
  before any call. (The refusal watcher below is built on every client, Era's too, at the first window or the
  options page: a frame that listens and does nothing else.) The call goes through `securecallfunction` (as Blizzard's popup code
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

Read in Forever's source (`Blizzard_SettingsDefinitions_Frame/Keybindings.lua`, `CreateKeybindingInitializers`), 6 November
2026: the bindings are **not** under the Options window's "AddOns" tab (that tab holds the addons' option pages, the
Settings categories). They are on the **Game** tab, under **Keybindings** (the last line of its list, below Gameplay's
others).

1. Game menu, Options, the **Game** tab, **Keybindings** in the list on the left (or the search box at the top of the window:
   typing "Open" finds the line by its name, "Open Lorekeeper's Codex": the screen indexes every binding's name).
2. The right side is a list of **collapsed** headings: Blizzard's own (Movement, Interface, Action Bar…), then
   ours at the very end, after "Other" (a heading is added in the order the bindings are listed, and only Blizzard's own
   are expanded by default: `AddBindingCategory(cat)` with no `expanded`). Scroll down and click the heading
   ("Lorekeeper's Codex") to open it: one line, "Open Lorekeeper's Codex".
3. Click the line's box (with a pad on Forever, the Gamepad UI's focus ring and its face button should do it: not
   verified), then press the key or pad button wanted. The screen listens to both.
4. Press it in the game: the window opens, press it again: it closes.

Why a player may not find it, in order of likelihood: the AddOns tab (wrong place), the collapsed heading at the bottom
of a long list (the game gives an addon's heading no mark), and the search not being used. What would be wrong on our
side: a category that is not `BINDING_HEADER_<KEY>` with that global a string (the heading would read
"BINDING_HEADER_<KEY>" literally, `GetBindingCategoryName`), or `Bindings.xml` missing from the zip (the 6 November test
zip has it: `LorekeepersCodex/Bindings.xml`, 147 bytes). `bindings.ts check` already asserts the first (the file's category
and the Lua's header) and the packager the second; the heading's global must exist before the game lists the bindings,
which `K.binding` at the top of a file (before `ADDON_LOADED`) guarantees: the check says "after the language file",
and Blizzard rebuilds the list on `ADDON_LOADED` of an addon with bindings.

### Not verified in the game

- That the engine sends pad buttons to the Lua on Era (the `GamePadEnable` setting) and that the binding screen
  shows the pad button's name, not a blank. The pad listener is in Blizzard's Lua in both games, the engine side
  is not. Probe, on Era with a pad and `GamePadEnable 1`: bind a pad button, press it.
- That Forever lists a binding with a plain default context while the Gamepad UI is on (Blizzard's own
  Interface bindings do the same). Probe: bind a pad button, press it with the Gamepad UI on.
- That a pad button is not swallowed by the focus ring of an open window (Smart Navigation reads the face
  buttons). Probe: with the window open, press the bound button: it should close it.
- That `Bindings.xml` needs no TOC line (the engine's rule; Blizzard's TOCs agree, the game decides).

## The taint error (6 November 2026) and the trace

Forever's secret values: a number the game hides from addons (a unit's health) can only be compared by code that
is not tainted, and taint is how the game remembers that an addon's code wrote or ran something: a function that reads a
slot an addon wrote, or runs an addon's function, is tainted from then on, up to the end of that execution.
The tester's error, `TextStatusBar.lua:110: attempt to compare a secret number value (execution tainted by
'LorekeepersCodex')`, came while changing Options > Game > Interface > Status Text (the call chain:
`Blizzard_Setting.lua` `ApplyValue` → `TriggerValueChanged` → `SettingsCallbackRegistry:TriggerEvent` →
`TextStatusBar` `OnStatusTextSettingChanged` → `UpdateTextStringWithValues`, line 110 is `valueMax > 0`).

What the pinned source (1.60.1.70532) says of our entries into it:

- **Our settings' getters, setters and callbacks are isolated by Blizzard.** `Settings.RegisterProxySetting` goes through
  `SettingsInbound` (`Blizzard_SettingsInbound.lua`): the call is a `SetAttribute` on a secure frame, the function
  arguments are wrapped in a closure (`SecureWrapFunctionArgs`, "so that taint is properly restored"), the setting is built
  from a secure copy of the mixin, and `ProxySettingMixin` calls our `get` and `set` through `securecallfunction`
  (`Blizzard_Setting.lua`, `SecureGetValueDerived`, `SecureSetValueDerived`). The callback registry runs every callback
  through `securecallfunction` (`CallbackRegistry.lua:210-213`). Our usage matches Blizzard's own readme
  (`Blizzard_ImplementationReadme.lua`). So the proxy settings are the least likely cause: it would take a slot
  they wrote, not their running.
- **Where Blizzard does run our code without that isolation** (all unproven as causes): (1) the slider's label formatter
  (`SetLabelFormatter`, our `O:bannerSeconds` and the book size choice use it) is called bare by `MinimalSlider.lua`,
  on our page only; (2) a dropdown's options function is isolated on the menu path (`Blizzard_Settings.lua:526` runs
  inside `securecallfunction(PopulateDescription…)`, `Blizzard_Menu/DropdownButton.lua:262`), but is bare in the hover
  tooltip (`Blizzard_Settings.lua:424`), and once `optionsFunc()` returns, the rest of the inserter runs tainted, so the
  `IsSelected` and `SetSelected` closures it makes are ours-tainted; the menu is built from module-wide pools
  (`Compositor.lua`, `Menu.lua`) that Status Text's dropdown shares. Not changed: nothing says a table in place of the
  function, or another formatter, is better.
- **The Gamepad UI's manager is the entry the research flagged and Blizzard has no precedent for.** Every Blizzard window
  that calls `FrameShown` is Blizzard's own (secure) frame; ours is a table full of slots we wrote. `FrameShown` reads
  fields of the frame (`GetScaledCenter`, `skipGamepadAutoFocus`, `FocusGamepad`…), stores it in `shownFrames` and
  `focusedFrame`, and Smart Navigation walks its children (`FindButtons`). The manager's state is read by every menu
  (a dropdown, Status Text's among them: `MenuProxy.OnShow` and `OnClose` call `SuspendFrame`, `FrameShown`,
  `FrameHidden`) and by every mouse click anywhere (`OnGlobalRegionMouseDown`). The test build was the first to call it,
  and the tester used the controller (a pad press reaches the manager through Smart Navigation's select, so the error's
  call chain below `securecallfunction` may well pass it: the **full stack** would say, its lowest lines: a menu
  button's OnClick points at the menu, Smart Navigation's select at the Gamepad UI).
- **Our stick call (`K.padText`) writes into Smart Navigation** (`currentScrollFrame` on a panel info, the stick flags:
  `SmartNavigation.lua:908-916`, `242-256`) from our execution, `securecallfunction` or not (it keeps taint out of the
  caller, it does not wash what goes in). `taintReport` looks at those slots and `pad off` stops the call.

None is proved. The order of suspicion: the manager, then the menu and pool vector from our dropdowns, then the formatter.

So this is a diagnosis to settle in the game, with three tools (all work on the player's own client):

1. `/<addon> pad` now prints a second line, `K.taintReport()`: for the slots above (the manager's, Smart Navigation's, the
   callback registry's `executingEvents` entry for Status Text, the Escape list) the name of the addon that wrote any that
   `issecurevariable(table, key)` says is not secure, `Taint: clean` otherwise. Run it before and after the error.
2. `/<addon> pad off` stops telling the manager (it is told every window of ours is hidden, after the fight in a fight)
   and stops the stick call, `/<addon> pad on` starts again, for the session (not saved, a reload turns it on): the same
   action once each way says whether the registration is the cause. Also: after a reload, change Status Text **without
   ever opening the addon's options page** (the menu and formatter vector), once with the pad on, once off.
3. Blizzard's own log, if both are not enough: `/console taintLog 1` in the game, `/reload`, repeat the action, log out
   (a reload clears the file), then the game folder's `Logs/taint.log`: send the lines that name `LorekeepersCodex` (the
   first one is the one that matters). `taintLog 2` logs every taint event (it can reach hundreds of megabytes in
   minutes: use it only for the one action). Levels 1 and 2 from the addon community's notes (WoWInterface threads),
   not in Blizzard's UI source: not verified on Forever.

## The stick

Read in `Blizzard_GamepadSmartNavigation/SmartNavigation.lua` and `Utility.lua`: the right stick scrolls **one scroll
frame per window**, the panel info's `currentScrollFrame` (`OnGamepadRightStick`, the update loop at line ~410:
`SetVerticalScroll` for a `ScrollFrame`, `SetScrollPercentage` for a scroll box). It is set when the cursor selects a
button that sits inside a scroll frame (`FindButtons`: a `ScrollFrame` object or a frame with a `.ScrollTarget`, and the
buttons found inside it), or by the window itself with `SmartNavigation:SetScrollFrameForFrame(window, scrollFrame)`
(`MailFrame.lua:628`, `QuestMapFrame.lua:2570`, `FloatingChatFrame.lua:161`, `CommunitiesAvatarPickerDialog.lua:42`).
A page of text holds no button, so the stick had nothing to scroll: it had never been told. `K.padText(window)` now makes
that call (through `securecallfunction`, behind `pcall`) for the window's visible text area (`K.page`, `K.board` and
the welcome's intro carry `kitText`): once the manager has the window, and when a book changes tab. It finds the panel
info only if the window already has one (`GetPanelInfo(window, true)` does not create it: the focus does, inside
`FrameShown`). The trace says `stick set N, no panel M` (the call is made only when Smart Navigation has a panel info for the window: it does nothing without one). Not verified in the game: whether the panel info exists by then, and
that the cursor standing on a row of the list (whose scroll frame the cursor sets by itself) takes the stick
from the text, as Blizzard's own windows behave.

## Off until chosen (8 November 2026)

Telling the manager taints it. The user's test of 8 November: `/codex pad` named
`manager.focusedFrame`, `manager.topSuspendedFrame` and
`SmartNavigation.activePanels[3].buttonGroups` as written by the addon, and the
Blizzard options page then failed on a change of the book's size ("blocked from
an action only available to the Blizzard UI"). So `K.padOn` is false by
default: the options page has a saved choice, "Controller support" (Forever
only, off, its tip says it may block the game's own windows until a reload),
and `/<addon> pad on` does it for a session. The flag is set from the page and
the manager is told when a window next shows, never from inside the Settings
callback.

LB and RB turn to the previous and next tab of a book (`K.tabs`, an
`OnGamePadButtonDown` on our own window, wrapping round, `PADLSHOULDER` and
`PADRSHOULDER`). It writes nothing of Blizzard's and works with the manager
off. `EnableGamePadButton(true)` and `SetPropagateKeyboardInput(true)` are set
together, once, out of combat (in a fight they wait for its end), so the book
never eats a button the game needs, and LB and RB reach the game too. Not
verified in the game: whether the game hands those buttons to the window while
the Gamepad UI is on, and whether the propagation flag governs pad buttons.

## The trace

`/<addon> pad` (any addon using `K.commands`, not in the usage) prints one line, from `K.padReport()`:

`Controller: Gamepad UI on, manager found, told shown 1, hidden 1, raised 0, blocked 0, waiting 0, stick set 1, registration on`

With a refusal, `blocked 2 (SetOverrideBinding(), Show())`: the names of the actions, five at most, each once.

- `Gamepad UI`: `InputUtil.IsGamepadUIEnabled()` (on, off, unknown), `manager`: found or absent (Era: absent).
- `told shown/hidden`: calls that returned without raising. `raised N (words)`: calls that raised, the last
  one's error. `blocked`: ADDON_ACTION_BLOCKED / ADDON_ACTION_FORBIDDEN events naming this addon (the taint
  worry: not verified in the game, this counts it), from the first window built or the options page, with the actions' names. `raised` is a lower bound (`securecallfunction` may hand an
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

## Known Forever beta bug class

The "blocked from an action only available to the Blizzard UI" popup (`SetPreferredGamepadInteractTarget()`) can appear on Forever with Controller support off and the manager untouched: Blizzard's own gamepad code (`UpdateInteractIcons`, reached from a chat clear, SmartNavigation or a panel) calls the protected function while the gamepad state is tainted, any addon can trip it (an empty addon with an empty slash command does), and only `/reload` clears it. Reports: [Questie#7899](https://github.com/Questie/Questie/issues/7899), [Horizon-Suite#489](https://github.com/Tacit-Labs/Horizon-Suite/issues/489) and the Blizzard forum thread "Native gamepad UI: empty addon triggers blocked-action popup loop". The fixes others found: keep your own objects out of Blizzard's gamepad lists, do not hide or reparent Blizzard frames from addon code.

**The evidence that settled where ours came from (8 November 2026).** In the Forever test the popup came with any *select* on an addon's Settings page: Goodwill, which carries the old kit with no controller code at all, did it too (`/codex pad` then showed `manager.focusedFrame`, `manager.topSuspendedFrame` and `SmartNavigation.activePanels[3].buttonGroups` tainted by Goodwill). Checkboxes and the Reload button did not. A Settings dropdown (`SettingsDropdownControlMixin` in `Blizzard_SettingControls.lua`) calls the addon's getter, its option list and its setter from inside Blizzard's code, and the same call chain then runs the Gamepad UI (`FrameShown` and `FrameHidden`, SmartNavigation's panel open and close), so what that chain touches is tainted.

**Why Blizzard's own barrier is not enough (read in the pinned 70862 source).** The new `SecureHelper` wraps only `FrameShown`, `FrameHidden`, `HandlePopupShown` and `HandlePopupHide` of the manager (`Blizzard_GamepadSharedUtility/FrameControlsManager.lua` lines 464, 561, 583, 589). The `MenuProxy.OnShow` callback (lines 248 to 265) first runs `SkipGamepadAutoFocus`, `DismissOnUnfocus` and `SuspendFrame`, which are not wrapped and write `topSuspendedFrame`, `suspendedButton` and `unsuspendToFrame`, and `MenuProxy.OnClose` (line 272) calls `UnsuspendFrame` (line 279) unwrapped as well. A menu's own opening runs `MenuElementDescriptionProxyMixin:IsSelected` (`Blizzard_Menu/Menu.lua` line 694), which calls the `isSelected` function it was given: for a Settings dropdown that is `setting:GetValue()`, our getter, and for `K.select` our `SetupMenu` closures. So an addon function runs in that chain just before `SuspendFrame` writes, and what it writes is tainted.

**The rule, and what is done (Forever only, where `GamepadMode` exists): we hand Blizzard no function.** Only script handlers on our own frames (`OnShow`, `OnClick`), which the game insulates.
- The options page (`K.options`, `canvasPage`) is a canvas category (`Settings.RegisterCanvasLayoutCategory`) of plain frames, no Settings control and no proxy setting. A box is a `CheckButton`, a choice, a sound and a number are a stepper (an arrow `Button`, the word, an arrow `Button`, plain buttons that SmartNavigation's button scan should reach, untested until a controller is on them, and a click on the word lists the others), Reload and Copy are `Button`s. Copying takes two steps (choose the character, then Copy). The page defines none of the three functions the panel would call (`OnRefresh`, `OnCommit`, `OnDefault`). `O.category` is nil there: an addon that adds Settings controls of its own to it (Hearthtale's Hardcore box and journal language) skips them on Forever until it builds them as rows.
- `K.select` (the book's filter and the welcome's selects) is the kit's own list (`kitSelect`, plain buttons) instead of the game's menu.
- Classic Era keeps the Settings controls as they were (it has no Gamepad UI).
Still true after this: a reload clears the popup, so the page ends with the Reload button.
