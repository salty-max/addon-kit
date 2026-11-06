# Controller support (Forever only)

The user's call of 6 November 2026: controller support is for WoW Forever only, Classic Era has no native
controller support. The research is `ideas/controller-support.md` (family folder). What the kit does:

- **Tells the Gamepad UI the windows exist.** Forever's Gamepad UI walks the D-pad across the buttons of the
  windows its `GamepadMode.FrameControlsManager` knows. `K.movable` (every kit window: the book, the welcome
  dialog) hooks OnShow and OnHide and calls `FrameShown(window)` and `FrameHidden(window)` as Blizzard's own
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
  transition handler: left alone). A focus ring of our own for Era, stick scrolling on Era, an open-by-pad
  binding, text input by pad.
- **Small fixes for everyone**: `K.HIT_X` (4) grow a row's and a chip's click sideways by 4 (they touch, so not up or down), a button's (3 and
  2), an item's (2); the scroll thumb follows `OnVerticalScroll` (the stick scrolls with `SetVerticalScroll`);
  `K.dialog` and `K.gameWindow` carry `.CloseButton` (the Gamepad UI closes a window by it); an item's tooltip
  and a chip's line show on a click too (Smart Navigation focuses, it does not hover).

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

- `K.movable` registers its hook first, so for a book `FrameShown` runs before the first tab is built on the
  very first showing (the book's own OnShow hook runs after it). If Blizzard's `FrameShown` collects the window's
  buttons at that moment, the first tab's rows would be missing from the D-pad ring on the first open only. A
  person with the Gamepad UI on settles it: open a book for the first time after a reload and see whether the ring
  reaches the rows (the `/<addon> pad` line says the call ran, not what it saw).
