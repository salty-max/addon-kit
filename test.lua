-- The kit against stand-ins for the game: its select on each of the game's
-- two dropdowns (the menu system's DropdownButton, the older UIDropDownMenu):
-- its options, its value set and chosen, its text, its placeholder; the
-- banners, with the game's alert container and without; a board.
--   luajit test.lua
local failures = 0
local function check(cond, msg)
  if cond then
    print("✓ " .. msg)
  else
    failures = failures + 1
    print("✗ " .. msg)
  end
end

-- A permissive frame: any method works; a few remember what they're told.
local function frame()
  local f = { scripts = {}, shown = true }
  return setmetatable(f, {
    __index = function(_, k)
      if k == "SetScript" then
        return function(self, n, fn) self.scripts[n] = fn end
      end
      if k == "SetEnabled" then
        return function(self, v) self.enabled = v end
      end
      if k == "Show" then
        return function(self) self.shown = true end
      end
      if k == "Hide" then
        return function(self) self.shown = false end
      end
      if k == "IsShown" then
        return function(self) return self.shown end
      end
      if k == "SetShown" then
        return function(self, v) self.shown = v and true or false end
      end
      if k == "CreateFontString" or k == "CreateTexture" or k == "CreateMaskTexture" then
        return function() return frame() end
      end
      if k == "SetText" then
        return function(self, v) self.text = v end
      end
      if k == "SetWordWrap" then
        return function(self, v) self.wordWrap = v end
      end
      -- (a texture's tint and greying: a ring's colour)
      if k == "SetVertexColor" then
        return function(self, r, g, b) self.vertex = { r, g, b } end
      end
      if k == "SetDesaturated" then
        return function(self, v) self.desaturated = v end
      end
      if k == "SetFont" then
        return function(self, _, size) self.fontSize = size end
      end
      -- (a text's width: its letters at about half its size each)
      if k == "GetUnboundedStringWidth" then
        return function(self) return #(rawget(self, "text") or "") * (rawget(self, "fontSize") or 12) * 0.55 end
      end
      if k == "SetPoint" then
        return function(self, ...) self.point = { ... } end
      end
      if k == "GetPoint" then
        return function(self) return unpack(rawget(self, "point") or {}) end
      end
      if k == "ClearAllPoints" then
        return function(self) self.point = nil end
      end
      if k == "IsMouseOver" then
        return function(self) return rawget(self, "mouseOver") end
      end
      if k == "SetTexture" then
        return function(self, v) self.texture = v end
      end
      if k == "SetHeight" then
        return function(self, v) self.height = v end
      end
      if k == "SetSize" then
        return function(self, w, h)
          self.w, self.h = w, h
        end
      end
      -- (a text's height: a line at its size, or what a test says)
      if k == "GetStringHeight" then
        return function(self) return rawget(self, "stringHeight") or rawget(self, "fontSize") or 12 end
      end
      if k == "GetHeight" then
        return function(self) return rawget(self, "height") or 100 end
      end
      if k == "GetFrameLevel" then
        return function() return 1 end
      end
      if k == "GetVerticalScroll" then
        return function(self) return rawget(self, "vscroll") or 0 end
      end
      if k == "SetVerticalScroll" then
        return function(self, v) self.vscroll = v end
      end
      return function(self) return self end
    end,
  })
end
UIParent, STANDARD_TEXT_FONT, UISpecialFrames = frame(), "Fonts\\FRIZQT__.TTF", {}
function GetLocale() return "enUS" end
function strtrim(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end

-- The menu system: a DropdownButton keeps its menu's generator and default text.
local function menuApi()
  MenuUtil, C_XMLUtil = {}, { GetTemplateInfo = function() return {} end }
  UIDropDownMenu_Initialize = nil
  CreateFrame = function(kind)
    local f = frame()
    if kind == "DropdownButton" then
      function f:SetupMenu(gen) self.gen = gen end
      function f:SetDefaultText(t) self.default = t end
      function f:GenerateMenu()
        local radios = {}
        local root = {
          CreateRadio = function(_, text, isSelected, setSelected, data)
            table.insert(radios, { text = text, isSelected = isSelected, setSelected = setSelected, data = data })
          end,
        }
        self.gen(self, root)
        self.radios = radios
        self.shownText = self.default
        for _, r in ipairs(radios) do
          if r.isSelected(r.data) then self.shownText = r.text end
        end
      end
      local setup = f.SetupMenu
      function f:SetupMenu(gen)
        setup(self, gen)
        self:GenerateMenu()
      end
    end
    return f
  end
end

-- UIDropDownMenu: a dropdown keeps its init function and its text.
local function dropDownApi()
  MenuUtil, C_XMLUtil = nil, nil
  CreateFrame = function() return frame() end
  local added
  function UIDropDownMenu_Initialize(f, init) f.init = init end
  function UIDropDownMenu_CreateInfo() return {} end
  function UIDropDownMenu_AddButton(info) table.insert(added, info) end
  function UIDropDownMenu_SetText(f, t) f.shownText = t end
  function UIDropDownMenu_SetWidth() end
  function UIDropDownMenu_EnableDropDown(f) f.enabled = true end
  function UIDropDownMenu_DisableDropDown(f) f.enabled = false end
  return function(f) -- opening it: its buttons
    added = {}
    f.init(f, 1)
    return added
  end
end

local function load()
  local ns = {}
  assert(loadfile("Kit.lua"))("Test", ns)
  return ns.kit
end
local OPTIONS = { { value = -1, text = "Zone discovery" }, { value = 878, text = "Quest complete" } }

-- ── the menu system's ────────────────────────────────────────────────────────
menuApi()
local K = load()
local s = K.select(UIParent, 170, "Choose")
check(s.box and rawget(s.box, "gen") == nil, "menu: a DropdownButton, in a box of its own")
s:SetOptions({})
check(s.box.enabled == false and s.box.shownText == "Choose", "menu: no options, disabled, the placeholder")
s:SetOptions(OPTIONS)
check(s.box.enabled == true and #s.box.radios == 2, "menu: its options, as radios")
s:SetValue(878)
check(s:GetValue() == 878 and s.box.shownText == "Quest complete", "menu: a value set shows its option")
local chosen
s.onChange = function(v) chosen = v end
s.box.radios[1].setSelected(s.box.radios[1].data)
s.box:GenerateMenu()
check(
  s:GetValue() == -1 and chosen == -1 and s.box.shownText == "Zone discovery",
  "menu: a choice made, told and shown"
)
s:SetValue(12345)
check(s:GetValue() == nil and s.box.shownText == "Choose", "menu: a value not offered: none, the placeholder")

-- ── UIDropDownMenu ───────────────────────────────────────────────────────────
local open = dropDownApi()
K = load()
s = K.select(UIParent, 170, "Choose")
s:SetOptions({})
check(s.box.enabled == false and s.box.shownText == "Choose", "dropdown: no options, disabled, the placeholder")
s:SetOptions(OPTIONS)
check(s.box.enabled == true and #open(s.box) == 2, "dropdown: its options, as buttons")
s:SetValue(-1)
local buttons = open(s.box)
check(
  s.box.shownText == "Zone discovery" and buttons[1].checked and not buttons[2].checked,
  "dropdown: a value set shows its option, checked"
)
chosen = nil
s.onChange = function(v) chosen = v end
buttons[2].func({ value = buttons[2].value })
check(
  s:GetValue() == 878 and chosen == 878 and s.box.shownText == "Quest complete",
  "dropdown: a choice made, told and shown"
)
s.placeholder = "Nobody yet"
s:SetOptions({})
check(s:GetValue() == nil and s.box.shownText == "Nobody yet", "dropdown: the placeholder can change")

-- ── banners ──────────────────────────────────────────────────────────────────
-- Timers run when the test says their time has come (the oldest live one).
local timers = {}
C_Timer = {
  NewTimer = function(seconds, fn)
    local t = { seconds = seconds, fn = fn }
    t.Cancel = function(self) self.cancelled = true end
    table.insert(timers, t)
    return t
  end,
}
local function elapse()
  for _, t in ipairs(timers) do
    if not t.cancelled then
      t.cancelled = true
      t.fn()
      return t.seconds
    end
  end
end
CreateFrame = function() return frame() end
GameTooltip, date = frame(), os.date
AlertFrame = nil
K = load()
local B = K.banners({ name = "TestBanner", art = "Logo", seconds = function() return 8 end })
local clicked
for n = 1, 3 do
  B:show({ kicker = "A page found", title = "Page " .. n, picture = "Icon", click = function() clicked = n end })
end
local one, two = B.frames[1], B.frames[2]
check(one.shown and two.shown and #B.waiting == 1, "banners: two at a time, the third waits its turn")
check(
  one.point[1] == "TOP" and two.point[5] < one.point[5] and not one.joined,
  "banners: without the game's alerts, a column from the top of the screen"
)
check(one.title.text == "Page 1" and one.kicker.text == "A page found", "banners: the line and the name")
one.mouseOver = true
check(elapse() == 8 and one.shown, "banners: kept while the mouse is on one")
one.mouseOver = false
check(
  elapse() == 8 and two.shown and two.title.text == "Page 3",
  "banners: the other gone in its time, the one waiting in its place"
)
one.scripts.OnClick(one, "LeftButton")
check(clicked == 1 and not one.shown, "banners: a click does what it is for, and closes it")
B.frames[2].scripts.OnClick(B.frames[2], "RightButton")
check(clicked == 1 and not B.frames[2].shown, "banners: a right-click only dismisses it")
do
  local pin = K.bannerCard("TestPin", 300, 140)
  check(
    pin.w == 300 and pin.h == 140 and pin.picture.point[2] == 14 and pin.picture.point[3] == -12 and pin.body,
    "banner card: so wide and tall, its picture where a banner's is"
  )
end
B:show({ title = "A broken picture", picture = function() error("no such picture") end })
check(
  B.frames[1].shown and B.frames[1].picture.tex.texture == "Logo",
  "banners: a picture that fails gives way to the art"
)

-- With the game's alert container: placed by it, in its stack.
AlertFrame = { subs = {}, updates = 0 }
function AlertFrame:AddAutoAnchoredSubSystem(f)
  f:SetAlertContainer(self)
  table.insert(self.subs, f)
end
function AlertFrame:UpdateAnchors()
  self.updates = self.updates + 1
  local rel = self
  for _, f in ipairs(self.subs) do
    if f:IsShown() then
      f:ClearAllPoints()
      f:SetPoint("BOTTOM", rel, "TOP", 0, 0)
      f:OnAlertAnchorUpdated()
      rel = f
    end
  end
end
K = load()
B = K.banners({ name = "Joined", seconds = 0 })
B:show({ title = "One" })
B:show({ title = "Two" })
one, two = B.frames[1], B.frames[2]
check(
  one.joined and one.point[2] == AlertFrame and two.point[2] == one and two.point[5] == 8,
  "banners: in the game's alerts, stacked by them, a little apart"
)
check(not one.timer and not two.timer, "banners: 0 seconds, until closed")
AlertFrame.UpdateAnchors = function() error("broken") end
one.scripts.OnClick(one, "RightButton")
check(not two.joined and two.point[1] == "TOP", "banners: the container failing them, their own column")
AlertFrame = nil

-- ── a board ──────────────────────────────────────────────────────────────────
K = load()
local items = {
  { id = "a", group = "g1", title = "A", text = "", earned = { level = 5, at = 0 } },
  { id = "b", group = "g1", title = "B", text = "", progress = function() return 2, 5 end },
  { id = "c", group = "g3", title = "C", text = "", unit = "pages", progress = function() return 7 end },
}
local board = K.board({
  parent = frame(),
  groups = { { "g1", "One", "Icon1", "x" }, { "g2", "Two", "Icon2", "x" }, { "g3", "Three", "Icon3", "y" } },
  figures = { { "all", "earned" }, { "x", "of x" } },
  items = function() return items end,
})
board:refresh("b")
local rows, heads = board.rows, board.headers
check(
  heads[1].shown and heads[1].count.text == "1 of 2" and not heads[2].shown and heads[3].shown,
  "board: each group's heading and count, none for a group with nothing to show"
)
check(
  rows[1].picture.ring.vertex[2] == K.RINGS.gold[1][2]
    and not rows[1].picture.ring.desaturated
    and rows[2].picture.ring.desaturated
    and rows[2].status.text == "2/5"
    and rows[3].status.text == "7 pages",
  "board: a gold ring on what is earned, iron on the rest, how far along it is"
)
check(
  board.strip.tiles[1].value.text == "1/3" and board.strip.tiles[2].value.text == "1/2",
  "board: the figures, in all and by group"
)
local below = rows[3].point[3]
rows[2].text.stringHeight = 26
board:refresh("b")
check(
  rows[2].height > rows[1].height and rows[3].point[3] < below,
  "board: a description on two lines makes its row taller, the rows below lower"
)

-- A slot: how many above one, an item's quality border from uncommon on, as
-- a bag shows it; one not had, greyed.
K = load()
ITEM_QUALITY_COLORS = { [1] = { r = 1, g = 1, b = 1 }, [2] = { r = 0.1, g = 1, b = 0 } }
local slot = K.slot(frame())
K.setSlot(slot, "Icon", 3, 2)
check(slot.count.text == "3" and slot.quality.shown, "slot: its count, an uncommon item's border")
K.setSlot(slot, "Icon", 1, 1, true)
check(slot.count.text == "" and not slot.quality.shown, "slot: one alone uncounted, a common item without a border")
K.setSlot(slot, false)
check(
  slot.empty.shown and not slot.icon.shown and not slot.frame.shown,
  "slot: nothing in it, the action bar's empty slot alone"
)
K.setSlot(slot, "Icon")
check(not slot.empty.shown and slot.icon.shown, "slot: an icon again, the empty slot gone")
ITEM_QUALITY_COLORS = nil
local square, round = K.cardRow(frame(), 300, true), K.cardRow(frame(), 300)
check(
  square.slot and square.picture == square.slot and rawget(square, "portrait") == nil,
  "card row: square, a slot for its picture"
)
check(round.portrait and round.picture == round.portrait and round.badge, "card row: round, a portrait and its medal")

-- A creature's ring by its rank, as the target frame marks one.
K = load()
check(
  K.rankRing("elite") == K.RINGS.gold
    and K.rankRing("rareelite") == K.RINGS.silver
    and K.rankRing("worldboss") == K.RINGS.rose
    and K.rankRing("normal") == nil
    and K.rankRing(nil) == nil,
  "rank ring: elite gold, rare silver, boss rose, the rest bronze"
)

-- A page's list of cards: a rule between them, none under the last.
K = load()
local pg = K.page(frame(), "TestPage")
pg:start("A page", "its line")
local first = pg:card("One", "", K.icon("Icon"))
local second = pg:card("Two", "", K.icon("Icon"), nil, nil, K.RINGS.gold)
pg:section("After them")
check(first.line.shown and not second.line.shown, "page: a rule between two cards, none under the last")
do
  local own = K.cardRow(pg.child, pg.width)
  pg:start("Another", "")
  local a = pg:card("One", "", K.icon("Icon"))
  pg:placeCard(own, K.CARD_H + 6)
  check(
    a.line.shown and not own.line.shown and pg.y == K.PAGE_HEADER_H + 2 + (K.CARD_H + 4) + (K.CARD_H + 10),
    "page: a card row of the tab's own joins the page's list of cards"
  )
end

-- A voice: the page's own face, signed on the right in the display face, no
-- rule beside it, an aside untouched; buttons, a click each, hidden on the
-- next page.
do
  pg:start("A letter", "")
  local clicked = false
  pg:text({ { "Dear friend,\n\nI did it.", voice = true, sign = "M." } })
  pg:buttons({ { "Break the seal", function() clicked = true end } })
  local v, b = pg.voices[1], pg.buttonPool[1]
  check(
    v.shown and v.text.text == "Dear friend,\n\nI did it." and v.text.fontSize == 13 and rawget(v, "bar") == nil,
    "page: a voice in the page's own face, no rule"
  )
  check(v.sign.shown and v.sign.text == "M." and v.sign.fontSize == 15, "page: a voice signed in the display face")
  check(#pg.asides == 0, "page: a voice is no aside")
  check(b.shown and b.text == "Break the seal", "page: a button with its words")
  b.scripts.OnClick(b)
  check(clicked, "page: a button's click")
  pg:start("Another", "")
  check(not v.shown and not b.shown, "page: the voice and the button hidden on the next page")
  pg:text({ { "Unsigned.", voice = true } })
  check(v.shown and not v.sign.shown, "page: a voice without a name, unsigned")
  -- (four buttons of 130 on a page of 440: the fourth on a row of its own;
  -- none: nothing placed)
  pg:start("Calls", "")
  local y0 = pg.y
  pg:buttons({})
  check(pg.y == y0, "page: no buttons, no room taken")
  pg:buttons({ { "A" }, { "B" }, { "C" }, { "D" } })
  local p3, p4 = pg.buttonPool[3].point, pg.buttonPool[4].point
  check(
    p3[4] == 280 and p3[5] == 0 and p4[4] == 0 and p4[5] == -(K.BUTTON_H + 6),
    "page: buttons wrap at the page's edge"
  )
  check(pg.y == y0 + 2 * K.BUTTON_H + 6 + 14, "page: two rows of buttons, two rows' room")
end

-- The family's button: wider when its words need it.
do
  local b = { SetWidth = function(s, w) s.w = w end, SetText = function(s, t) s.t = t end }
  function b.GetFontString()
    return { GetStringWidth = function() return 200 end }
  end
  K.setButton(b, "Bearbeiten und mehr", 120)
  check(b.w == 224 and b.t == "Bearbeiten und mehr", "button: wider for long words")
  function b.GetFontString()
    return { GetStringWidth = function() return 40 end }
  end
  K.setButton(b, "Edit", 120)
  check(b.w == 120, "button: its own width for short words")
end

-- The lists' shared kinds, a list without a style of its own.
do
  local l = K.list(frame(), nil, {})
  check(l.style == K.listStyle, "list: the shared kinds by default")
  l:begin()
  local s = l:add("section", "Elwynn Forest")
  local r = l:add("letter", "Maybell", 1)
  local n = l:add("note", "No letter yet.")
  check(
    s.text.fontSize == 14 and r.text.fontSize == 12 and n.text.fontSize == 12,
    "list: a section in the display face, rows in the body"
  )
  check(l.y == 22 + 18 + 18, "list: a section's height and two rows'")
  local e = l:add("entry", "Entry 3", nil, "Westfall, levels 12 to 13")
  local plain = l:add("letter", "Maybell")
  check(
    e.text.fontSize == 13 and e.under.shown and e.under.text == "Westfall, levels 12 to 13" and not plain.under.shown,
    "list: an entry's two lines, a plain row without the second"
  )
  check(l.y == 22 + 18 + 18 + 36 + 18, "list: an entry's height")
end

-- The second pass: the name in chat in the addon's accent, a tooltip's two
-- inks, the achievement sound (the fanfare, Quest complete where there is
-- none, the player's own), a place kept, a long title made smaller.
do
  K.theme({ accent = { 1, 0, 0.5 } })
  check(K.prefix("Mealbook") == "|cffff007fMealbook:|r ", "prefix: the name in the accent, a colon")
  K.theme()
  local lines = {}
  local tip = { AddLine = function(_, text, r, g, b, wrap) table.insert(lines, { text, r, g, b, wrap }) end }
  K.tooltipLine(tip, "Yonder: not yet recorded", true)
  K.tooltipLine(tip, "Mealbook: cooks into five dishes", false, true)
  check(
    lines[1][3] == 0.82 and lines[2][2] == 0.65 and not lines[1][5] and lines[2][5],
    "tooltip: the gold to find, the brown once known, one line unless asked to wrap"
  )
  local played = {}
  PlaySound = function(id)
    table.insert(played, id)
    return id ~= K.FANFARE
  end
  K.achievementSound()
  check(played[1] == K.FANFARE and played[2] == 878, "achievement sound: the fanfare, Quest complete without it")
  played = {}
  K.achievementSound(3175)
  check(#played == 1 and played[1] == 3175, "achievement sound: the player's own")
  check(
    K.ACHIEVEMENT_SOUNDS[1][1] == K.FANFARE and #K.ACHIEVEMENT_SOUNDS == #K.SOUNDS + 1,
    "achievement sounds: the fanfare first, the kit's after"
  )
  PlaySound = nil
  local saved = {}
  local p = K.place(saved, "book")
  p.point = "LEFT"
  check(K.place(saved, "book").point == "LEFT" and saved.places.book == p, "place: kept in the addon's table")
  check(K.BANNER_SECONDS == 10, "banners: ten seconds by default")
  local tp = K.page(frame(), "TitlePage")
  tp:start("A Word from the Royal Historian", "Note", K.icon("Icon"))
  check(tp.title.fontSize < 24 and tp.title.fontSize >= 18, "page: a long title in a smaller face")
  check(not tp.title.wordWrap, "page: a title that fits smaller on one line")
  tp:start("The Ballad of the Long Road from Ironforge to Menethil Harbor and Back", "")
  check(tp.title.fontSize == 18 and tp.title.wordWrap, "page: a title too long at 18 on two lines")
  tp:start("Auberdine", "")
  check(tp.title.fontSize == 24 and not tp.title.wordWrap, "page: a short title at its size, one line")
end

-- Two rows of items on a page, two strips of figures, two sets of names:
-- each in a box of its own at its own place, none on top of another; a slot
-- of the first row's box on one page, of the second's on the next, shown.
do
  local function anchor(b) return b.point[2], b.point[5] end
  pg:start("Dish", "")
  pg:stats({ { "1", "one" } })
  pg:items({ { 769, nil, false, 1 } })
  pg:section("It makes")
  pg:items({ { 2681, nil, false, 1 } })
  pg:chips({ { "A" } })
  pg:chips({ { "B" } })
  pg:stats({ { "2", "two" } })
  local s1, s2 = pg.itemPool[1], pg.itemPool[2]
  local c1, c2 = pg.chipPool[1], pg.chipPool[2]
  local t1, t2 = pg.tiles[1], pg.tiles[2]
  local box1, box2 = anchor(s1), anchor(s2)
  check(
    box1 ~= box2 and box1.point[5] > box2.point[5] and s1.itemId == 769 and s2.itemId == 2681,
    "page: two rows of items, each in its own box, the second below the first"
  )
  check(
    anchor(c1) ~= anchor(c2) and anchor(t1) ~= anchor(t2),
    "page: two sets of names, two strips of figures, each in its own box"
  )
  pg:start("Another", "")
  pg:stats({ { "3", "three" } })
  pg:items({ { 1, nil, false, 1 }, { 2, nil, false, 1 } })
  check(
    s2.shown and anchor(s2) == pg.boxes[2] and pg.boxes[2].shown and not pg.boxes[3].shown,
    "page: a slot reused in another box shown there, the boxes not used hidden"
  )
end

-- A figure's label: its own size when it fits, a little smaller when it
-- wouldn't, on its one line, never cut short.
do
  local strip = K.figures(UIParent)
  local h = strip:set({ { "1", "slain" }, { "20", "a label far too long for its little tile" } }, 230)
  local fits, long = strip.tiles[1].label, strip.tiles[2].label
  check(
    h == 50
      and fits.fontSize == 11
      and long.fontSize < 11
      and long.fontSize >= 8
      and long.text == "a label far too long for its little tile",
    "figures: a label that fits keeps its size, a long one is set smaller on its one line, whole"
  )
end

-- A row of a page: as tall as its label when the label takes two lines.
do
  local pg2 = K.page(UIParent, "KitTestRows", { width = 300, labelWidth = 60 })
  pg2:start("Rows")
  pg2:pair(1).label.stringHeight = 30 -- (a label on two lines)
  pg2:row("Vu pour la dernière fois", "12 oct.")
  check(pg2.pairs[1].height == 30, "page: a row as tall as its label on two lines")
end

-- The game's achievement alert: set up as the book's (its picture, line and
-- name, no points, a click that opens the book), queued among the game's
-- alerts; the book's banner where the client has none, or where setting it
-- up fails (said once).
do
  local shown, said, opened = {}, {}, false
  local banners = { show = function(_, b) table.insert(shown, b) end }
  local a = K.achievements({ banners = banners, art = "Logo", say = function(m) table.insert(said, m) end })
  AlertFrame, C_XMLUtil = nil, nil
  a:show({ kicker = "Yonder milestone", title = "First Steps" })
  check(#shown == 1 and shown[1].title == "First Steps", "achievements: no alert in the client, the book's banner")

  local alert = frame()
  alert.Icon = { Texture = alert }
  alert.Unlocked, alert.Name, alert.Shield = frame(), frame(), frame()
  local queued
  AlertFrame = {
    AddQueuedAlertFrameSubSystem = function(_, template, setUp, shownAtOnce, waiting)
      queued = { template = template, shownAtOnce = shownAtOnce, waiting = waiting }
      return { AddAlert = function(_, b) return setUp(alert, b) end }
    end,
  }
  C_XMLUtil = { GetTemplateInfo = function() return {} end }
  a = K.achievements({ banners = banners, art = "Logo", say = function(m) table.insert(said, m) end })
  a:show({
    picture = "Book",
    kicker = "Yonder milestone",
    title = "First Steps",
    click = function() opened = true end,
  })
  alert.scripts.OnClick(alert, "LeftButton")
  check(
    queued.template == "AchievementAlertFrameTemplate"
      and queued.shownAtOnce == 2
      and alert.texture == "Book"
      and alert.Unlocked.text == "Yonder milestone"
      and alert.Name.text == "First Steps"
      and alert.Shield.shown == false
      and opened
      and #shown == 1,
    "achievements: the game's alert, the book's picture and words, no points, a click to the book"
  )

  alert.Icon = nil -- (a client whose alert is made otherwise)
  a = K.achievements({ banners = banners, art = "Logo", say = function(m) table.insert(said, m) end })
  a:show({ title = "Second" })
  a:show({ title = "Third" })
  check(
    #shown == 3 and shown[2].title == "Second" and shown[3].title == "Third" and #said == 1,
    "achievements: an alert that fails to set up, the book's banner (said once)"
  )
  AlertFrame, C_XMLUtil = nil, nil
end

-- Words: English by default, a language's file fills K.L (its plural rule,
-- its month names); a word it lacks stays English.
do
  local L = K.L
  check(L["Begin"] == "Begin" and K.plural(1, "page", "pages") == "page", "words: English by default")
  local at = os.time({ year = 2026, month = 10, day = 5, hour = 12 })
  check(K.day(at) == "5 Oct 2026", "words: a day, its number unpadded")
  local late = os.time({ year = 2026, month = 10, day = 5, hour = 16, min = 5 })
  check(
    K.day(late, { year = false, time = true }) == "5 Oct 16:05" and K.day(late, { time = true }) == "5 Oct 2026 16:05",
    "words: a day without its year, with the time"
  )
  check(K.month(at) == "Oct", "words: a month alone")
  L["Begin"], L["Oct"], L["pages"], L["page"] = "Commencer", "oct.", "pages", "page"
  local one = K.isOne
  K.isOne = function(n) return n <= 1 end -- (French: 0 and 1 take the singular)
  check(
    L["Begin"] == "Commencer" and L["Your choices"] == "Your choices" and K.plural(0, "page", "pages") == "page",
    "words: a language's own, the rest English, its plural rule"
  )
  check(K.day(at) == "5 oct. 2026", "words: its month names")
  L["Begin"], L["Oct"], L["pages"], L["page"] = nil, nil, nil, nil
  K.isOne = one
end

-- ── what the game says of the world, shared ──────────────────────────────────
-- Off until the player says yes; then a quest's texts (their name the game's
-- token, a whole word only; their class and race marked with the word), a
-- creature's facts, an NPC's line (never one naming another player), loot by
-- source; a no stops it.
do
  local units = {}
  GetBuildInfo = function() return "1.15.9", "70003", "Oct 1 2026", 11509 end
  UnitName = function(u) return (units[u] or {}).name end
  UnitClass = function(u) return (units[u] or {}).class end
  UnitRace = function(u) return (units[u] or {}).race end
  UnitGUID = function(u) return (units[u] or {}).guid end
  UnitExists = function(u) return units[u] ~= nil end
  UnitIsPlayer = function(u) return (units[u] or {}).player == true end
  UnitPlayerControlled = function(u) return (units[u] or {}).controlled == true end
  UnitLevel = function(u) return (units[u] or {}).level end
  UnitClassification = function(u) return (units[u] or {}).rank end
  UnitCreatureType = function(u) return (units[u] or {}).ctype end
  UnitCreatureFamily = function(u) return (units[u] or {}).family end
  C_CreatureInfo = {
    GetCreatureTypeIDs = function() return { 1, 7 } end,
    GetCreatureTypeInfo = function(id) return ({ { name = "Beast" }, [7] = { name = "Humanoid" } })[id] end,
    GetCreatureFamilyIDs = function() return { 1 } end,
    GetCreatureFamilyInfo = function(id) return ({ { name = "Wolf" } })[id] end,
  }
  UnitReaction = function() return 2 end
  C_Map = {
    GetBestMapForUnit = function() return 1426 end,
    GetPlayerMapPosition = function()
      return { GetXY = function() return 0.4612, 0.2501 end }
    end,
  }
  units.player = { name = "Maxou", class = "Warrior", race = "Dwarf", player = true }
  local quest = {}
  GetQuestID = function() return quest.id end
  GetTitleText = function() return quest.title end
  GetQuestText = function() return quest.details end
  GetObjectiveText = function() return quest.objectives end
  GetProgressText = function() return quest.request end
  GetRewardText = function() return quest.reward end
  local loot = {}
  GetNumLootItems = function() return #loot end
  GetLootSlotLink = function(i) return loot[i].link end
  GetLootSourceInfo = function(i) return unpack(loot[i].sources) end
  local made
  CreateFrame = function()
    made = frame()
    return made
  end
  local K = load()
  _G.SaltyMaxCollector = nil
  local saved = {}
  local C = K.collect({ saved = function() return saved end, prefix = "Kit: " })
  C:start()
  check(not C:on() and made == nil and next(saved.facts) == nil, "collect: off by default, nothing kept")
  local said = {}
  local print0 = print
  print = function(s) table.insert(said, s) end
  C:set(true)
  C:set(true)
  print = print0
  check(
    #said == 1 and said[1]:find("^Kit: Thank you,") and said[1]:find("github.com/salty-max/ravenpost", 1, true),
    "collect: a yes says where Ravenpost is, once"
  )
  local fire = function(event, ...) made.scripts.OnEvent(made, event, ...) end
  units.questnpc = { guid = "Creature-0-1-0-1-197-0000000001" }
  quest.id, quest.title = 33, "Wolves Across the Border"
  quest.details = "Hey Maxou, a Dwarf Warrior like you can bring me meat."
  quest.objectives = "Bring 8 Tough Wolf Meat."
  fire("QUEST_DETAIL")
  local q = saved.facts.enUS.quest[33]
  check(
    q
      and q.details == "Hey $N, a $R{Dwarf} $C{Warrior} like you can bring me meat."
      and q.giver == "npc:197"
      and q.map == 1426
      and q.x == 46.1,
    "collect: a quest's texts, its giver and where, the player as the game's tokens"
  )
  quest.reward = "Thanks, Maxou."
  fire("QUEST_COMPLETE")
  check(q.reward == "Thanks, $N." and q.ender == "npc:197", "collect: its reward text and ender")
  units.mouseover = {
    guid = "Creature-0-1-0-1-299-0000000002",
    name = "Young Wolf",
    level = 2,
    rank = "normal",
    ctype = "Beast",
    family = "Wolf",
  }
  fire("UPDATE_MOUSEOVER_UNIT")
  units.mouseover.level = 3
  fire("UPDATE_MOUSEOVER_UNIT")
  local w = saved.facts.enUS.npc[299]
  check(
    w
      and w.name == "Young Wolf"
      and w.level[1] == 2
      and w.level[2] == 3
      and w.typeId == 1
      and w.familyId == 1
      and w.type == nil
      and w.rank == "normal",
    "collect: a creature, its levels seen, its type and family by their ids"
  )
  check(w.world == true, "collect: a world NPC carries the controlled-unit check")
  units.target = {
    guid = "Creature-0-1-0-1-1860-0000000010",
    name = "Graz'nar",
    level = 10,
    controlled = true,
  }
  fire("PLAYER_TARGET_CHANGED")
  check(saved.facts.enUS.npc[1860] == nil, "collect: a summoned Voidwalker with a Creature GUID is not world data")
  fire("UPDATE_MOUSEOVER_UNIT")
  check(saved.facts.enUS.npc[299] == w, "collect: an uncontrolled creature is still recorded")
  units.mouseover = { guid = "Creature-0-1-0-1-300-0000000003", name = "Odd Thing", level = 5, ctype = "Oddity" }
  fire("UPDATE_MOUSEOVER_UNIT")
  check(
    saved.facts.enUS.npc[300].type == "Oddity" and saved.facts.enUS.npc[300].typeId == nil,
    "collect: a type the game gives no id to, as the game says it"
  )
  saved.facts.enUS.npc[300] = nil
  units.mouseover = { guid = "Player-1-0000ABCD", name = "Someone", player = true }
  fire("UPDATE_MOUSEOVER_UNIT")
  check(
    saved.facts.enUS.npc[0] == nil and next(saved.facts.enUS.npc, next(saved.facts.enUS.npc)) == nil,
    "collect: never a player"
  )
  fire(
    "CHAT_MSG_MONSTER_YELL",
    "Maxou! Fresh meat!",
    "Hogger",
    "",
    "",
    "",
    "",
    0,
    0,
    "",
    0,
    0,
    "Creature-0-1-0-1-448-0000000003"
  )
  units.party1 = { name = "Friendly", player = true }
  fire(
    "CHAT_MSG_MONSTER_SAY",
    "Friendly, come here.",
    "Hogger",
    "",
    "",
    "",
    "",
    0,
    0,
    "",
    0,
    0,
    "Creature-0-1-0-1-448-0000000003"
  )
  local h = saved.facts.enUS.say[448]
  check(
    h and h["$N! Fresh meat!"] == "yell" and h["Friendly, come here."] == nil,
    "collect: an NPC's line, never one naming another player"
  )
  loot = {
    { link = "|cff9d9d9d|Hitem:750:0:0|h[Tough Wolf Meat]|h|r", sources = { "Creature-0-1-0-1-299-0000000002", 1 } },
    { link = "|cffffffff|Hitem:2589:0:0|h[Linen Cloth]|h|r", sources = { "Creature-0-1-0-1-299-0000000002", 1 } },
  }
  fire("LOOT_OPENED")
  local l = saved.facts.enUS.loot["npc:299"]
  check(l and l.looted == 1 and l.items[750] == 1 and l.items[2589] == 1, "collect: what a corpse gave, once a looting")
  check(
    C:tokens("Maxou's name, not Maxoume's, in Stormwind") == "$N's name, not Maxoume's, in Stormwind",
    "collect: the name a whole word only"
  )
  check(
    C:tokens("A warrior, the Warrior's Hall") == "A $c{warrior}, the $C{Warrior}'s Hall",
    "collect: the class marked with its word, lowercase too, for the database to resolve"
  )
  said = {}
  print = function(line) table.insert(said, line) end
  C:set(false)
  C:set(false)
  print = print0
  local before = saved.facts.enUS.quest[33]
  quest.id = 34
  fire("QUEST_DETAIL")
  check(
    not C:on() and before and saved.facts.enUS.quest[34] == nil and _G.SaltyMaxCollector == nil,
    "collect: a no stops it, keeps what was kept, gives up the claim"
  )
  check(#said == 1 and said[1]:find("^Kit: Sharing what you see is off"), "collect: a no is said once")
  C:set(true)
  quest.id = 33
  fire("QUEST_DETAIL")
  check(saved.facts.enUS and saved.facts.enUS.quest[33], "collect: a yes again goes on")
  saved.facts.enUS.npc = { [1860] = { name = "Graz'nar" }, [299] = { name = "Young Wolf", world = true } }
  saved.facts.deDE = { npc = { [1860] = { name = "Graz'nar" } }, gossip = { [448] = { Hallo = true } } }
  C:start()
  check(
    saved.facts.enUS.npc[1860] == nil
      and saved.facts.deDE.npc[1860] == nil
      and saved.facts.enUS.npc[299].world
      and saved.facts.enUS.quest[33]
      and saved.facts.deDE.gossip[448].Hallo,
    "collect: old unchecked NPCs are purged in every language, preserving new NPCs, quests and dialogue"
  )
  for _, world in ipairs({ { toc = 20506 }, { toc = 11509, season = 2 } }) do
    GetBuildInfo = function() return "x", "70003", "Oct 1 2026", world.toc end
    C_Seasons = { GetActiveSeason = function() return world.season end }
    _G.SaltyMaxCollector = nil
    local other = { share = true }
    load().collect({ saved = function() return other end }):start()
    check(_G.SaltyMaxCollector == nil and other.game == nil, "collect: never TBC's world nor the Season of Discovery's")
  end
  C_Seasons = nil
  _G.SaltyMaxCollector = nil
end

-- The game's window: its body the dialog box's dark, not the grey stone.
do
  local bg, seen = frame(), nil
  bg.SetTexture = function(_, file) seen = file end
  CreateFrame = function()
    local w = frame()
    w.Bg = bg
    return w
  end
  local w = K.gameWindow("TestWindow", "Test")
  check(
    w and seen == "Interface\\DialogFrame\\UI-DialogBox-Background-Dark",
    "gameWindow: its body dark, the dialog box's"
  )
  CreateFrame = function() return frame() end
end

-- Which game, from the client's interface number; ns told too.
do
  for _, g in ipairs({ { 11509, "classic" }, { 16001, "forever" }, { 17000, "forever" }, { 20506, "tbc" } }) do
    GetBuildInfo = function() return "x", "1", "d", g[1] end
    local ns = {}
    assert(loadfile("Kit.lua"))("Test", ns)
    check(
      ns.kit.GAME == g[2] and ns.forever == (g[2] == "forever") and ns.tbc == (g[2] == "tbc"),
      "game: " .. g[1] .. " is " .. g[2]
    )
  end
  GetBuildInfo = nil
end

-- Events: each listener on its own (one's error never silences the others),
-- nothing before the login or while not ready, always after the others, a
-- frame a unit.
do
  local frames, made = {}, nil
  CreateFrame = function()
    local f = frame()
    f.events, f.units = {}, {}
    function f:RegisterEvent(e)
      if e == "NOT_AN_EVENT" then error("unknown event") end
      self.events[e] = true
    end
    function f:UnregisterEvent(e) self.events[e] = nil end
    function f:RegisterUnitEvent(e, u) self.units[e] = u end
    table.insert(frames, f)
    return f
  end
  local errors = {}
  geterrorhandler = function()
    return function(e) table.insert(errors, e) end
  end
  local K = load()
  local ready, heard, logged = false, {}, 0
  local E = K.events({
    login = function()
      logged = logged + 1
      error("login broke")
    end,
    ready = function() return ready end,
  })
  made = E.frame
  E.on("BAG_UPDATE", function() error("first broke") end)
  E.on("BAG_UPDATE", function(n) table.insert(heard, "second " .. n) end)
  E.always("PLAYER_LOGOUT", function() table.insert(heard, "always") end)
  E.on("PLAYER_LOGOUT", function() table.insert(heard, "on") end)
  E.on("NOT_AN_EVENT", function() end)
  local fire = function(e, ...) made.scripts.OnEvent(made, e, ...) end
  fire("BAG_UPDATE", 1)
  check(#heard == 0, "events: nothing before the login")
  fire("PLAYER_LOGIN")
  check(logged == 1 and errors[1] and errors[1]:find("login broke"), "events: the login run first, its error reported")
  fire("BAG_UPDATE", 2)
  check(#heard == 0, "events: nothing while not ready")
  ready = true
  fire("BAG_UPDATE", 3)
  check(heard[1] == "second 3" and #errors == 2, "events: one listener's error, the next still hears")
  heard = {}
  fire("PLAYER_LOGOUT")
  check(heard[1] == "on" and heard[2] == "always", "events: always after the others")
  ready, heard = false, {}
  fire("PLAYER_LOGOUT")
  check(#heard == 1 and heard[1] == "always", "events: always heard while not ready")
  check(
    made.events.BAG_UPDATE and not made.events.NOT_AN_EVENT and not K.knows("NOT_AN_EVENT"),
    "events: an unknown one never registered"
  )
  ready = true
  local got = {}
  E.onUnit("UNIT_HEALTH", "player", function() table.insert(got, "player") end)
  E.onUnit("UNIT_HEALTH", "target", function() table.insert(got, "target") end)
  local playerFrame, targetFrame = frames[#frames - 1], frames[#frames]
  check(
    playerFrame ~= targetFrame
      and playerFrame.units.UNIT_HEALTH == "player"
      and targetFrame.units.UNIT_HEALTH == "target",
    "events: a frame a unit"
  )
  targetFrame.scripts.OnEvent(targetFrame, "UNIT_HEALTH", "target")
  check(#got == 1 and got[1] == "target", "events: a unit's listeners alone")
  CreateFrame = function() return frame() end
end

-- Words as a search compares them; lowercase beyond ASCII.
do
  local K = load()
  check(
    K.lower("ÉLÉMENTAIRE Ёлка ПРИВЕТ") == "élémentaire ёлка привет",
    "words: lowercase in Latin-1 and Cyrillic"
  )
  check(K.plain("Comté-de-l’Or") == "comte-de-l'or", "search: accents and the curly apostrophe aside")
  check(
    K.finds("Comté-de-l’Or", K.plain("COMTE-DE-L'OR")) and not K.finds("Elwynn", "durotar") and K.finds("x", ""),
    "search: finds the typed words"
  )
end

-- The family's welcomes take turns: the second waits for the first to close.
do
  local K = load()
  SaltyMaxWelcomes = nil
  local timers = {}
  C_Timer = { After = function(_, fn) table.insert(timers, fn) end }
  InCombatLockdown = function() return false end
  local evts = {}
  CreateFrame = function()
    local f = frame()
    table.insert(evts, f)
    return f
  end
  local function welcome()
    local W = { shown = 0 }
    function W:Show()
      self.shown = self.shown + 1
      if not self.frame then
        self.frame = frame()
        local hooks = {}
        function self.frame:HookScript(_, fn) table.insert(hooks, fn) end
        function self.frame:Hide()
          for _, fn in ipairs(hooks) do
            fn()
          end
        end
      end
    end
    return W
  end
  local P = { get = function() return false end }
  local one, two = welcome(), welcome()
  K.welcomeOnce(one, P)
  local e1 = evts[#evts]
  K.welcomeOnce(two, P)
  local e2 = evts[#evts]
  e1.scripts.OnEvent(e1, "PLAYER_ENTERING_WORLD", true)
  e2.scripts.OnEvent(e2, "PLAYER_ENTERING_WORLD", true)
  for _, fn in ipairs(timers) do
    fn()
  end
  timers = {}
  check(one.shown == 1 and two.shown == 0, "welcome: one at a time, the second waits")
  one.frame:Hide()
  for _, fn in ipairs(timers) do
    fn()
  end
  check(two.shown == 1, "welcome: the next once one is closed")
  CreateFrame = function() return frame() end
  SaltyMaxWelcomes = nil
end

-- The board: an achievement without its progress or its day never breaks a row.
do
  local K = load()
  local B = K.board({
    parent = frame(),
    name = "TestBoard2",
    groups = { { "g", "Group", "Interface\\Icons\\INV_Misc_QuestionMark" } },
    items = function()
      return {
        { id = "a", group = "g", title = "No progress", text = "t" },
        { id = "b", group = "g", title = "Old", text = "t", earned = { level = 12 } },
      }
    end,
  })
  local ok = pcall(B.refresh, B)
  check(
    ok and B.rows[1].status.text == "0/1" and B.rows[2].status.text == "Level 12",
    "board: no progress, no day: still a row"
  )
end

-- Words handed over: plurals, gender, Classic's names swapped longest first.
do
  local K = load()
  UnitSex = function() return 3 end
  K.translate({ locale = "ruRU", plural = "ru", words = { ["You are ready"] = "Vous êtes $gprêt:prête;" } })
  check(
    K.L["You are ready"] == "Vous êtes prête" and K.isOne(21) and not K.isOne(11),
    "words: gender and Russian's plural"
  )
  local swaps = { { "Comté", "Comté-de-l'Or" }, { "Comté-de-l'Or", "Elwynn" } }
  check(
    K.swap("Comté-de-l'Or et Comté", swaps) == "Elwynn et Comté-de-l'Or",
    "words: the longest name swapped first"
  )
  check(K.upper("écrit Привет") == "ÉCRIT ПРИВЕТ", "words: capitals beyond ASCII")
  UnitSex = nil
end

-- The game's things by id: a creature's from a GUID (a vehicle's too), a mask.
do
  local K = load()
  check(
    K.npcId("Creature-0-4372-0-21-5824-00005E7A2B") == 5824 and K.npcId("Vehicle-0-4372-0-21-28670-0001") == 28670,
    "ids: a creature's, a vehicle's"
  )
  check(K.npcId("Player-1-0ABC") == nil and K.npcId(nil) == nil, "ids: none for a player")
  UnitRace = function() return "Dwarf", "Dwarf", 3 end
  UnitClass = function() return "Warrior", "WARRIOR", 1 end
  check(
    K.forMe(nil, 0) and K.forMe(4, 1) and not K.forMe(2, 1) and not K.forMe(4, 2),
    "ids: a mask's races and classes"
  )
  check(K.forMe(2 ^ 31, nil, { [3] = 31 }), "ids: a race of its own bit")
end

-- Links: written in a colour, followed by their scheme.
do
  local followed
  LinkUtil = { RegisterLinkHandler = function(_, fn) LinkUtil.fn = fn end }
  local K = load()
  local link = K.links("kittest", function(target) followed = target end)
  check(link("ach:5", "First Steps") == "|cffffd100|Hkittest:ach:5|h[First Steps]|h|r", "links: written")
  LinkUtil.fn("kittest:ach:5")
  LinkUtil.fn("other:1")
  check(followed == "ach:5", "links: followed, another scheme's left alone")
  LinkUtil = nil
end

-- The minimap button: placed by its angle, shown or not by its setting.
do
  local opts = { minimapAngle = 90, minimapHidden = false }
  Minimap = frame()
  Minimap.GetWidth = function() return 140 end
  CreateFrame = function() return frame() end
  local K = load()
  local M = K.minimapButton({
    name = "TestMinimapButton",
    icon = "x",
    title = "Test",
    get = function(k) return opts[k] end,
    set = function(k, v) opts[k] = v end,
  })
  local _, _, _, x, y = M.button:GetPoint()
  check(math.abs(x) < 0.001 and math.abs(y - 80) < 0.001 and M.button.shown, "minimap: placed by its angle, shown")
  opts.minimapHidden = true
  M:update()
  check(not M.button.shown, "minimap: hidden by its setting")
  check(K.MINIMAP_ANGLES.LorekeepersCodex ~= K.MINIMAP_ANGLES.Hearthtale, "minimap: the family's places apart")
  Minimap = nil
end

-- The slash command: alone it opens, an unknown word the usage, replies said.
do
  SlashCmdList = {}
  local K = load()
  local said, opened, hidden, own = {}, 0, false, nil
  local print0 = print
  print = function(line) table.insert(said, line) end
  K.commands({
    names = { "/kt", "/kittest" },
    key = "KITTEST",
    name = "Kit Test",
    prefix = "Kit: ",
    profiles = { import = function(_, code) return code == "KT1:h1" end },
    open = function() opened = opened + 1 end,
    usage = "/kt opens the book.",
    settings = function() return false end,
    minimap = { get = function() return hidden end, set = function(_, v) hidden = v end },
    commands = { where = function(raw) own = raw end },
  })
  local run = SlashCmdList.KITTEST
  run("")
  run("nonsense")
  run("import KT1:h1")
  run("import nope")
  run("settings")
  run("minimap")
  run("WHERE")
  print = print0
  check(SLASH_KITTEST1 == "/kt" and SLASH_KITTEST2 == "/kittest" and opened == 1, "commands: its names, alone it opens")
  check(said[1] == "Kit: /kt opens the book.", "commands: an unknown word, the usage")
  check(said[2] == "Kit: Settings imported for this character.", "commands: an import, capitalised")
  check(
    said[3] == "Kit: That isn't a Kit Test settings code (/kt export makes one).",
    "commands: a code refused, how to make one"
  )
  check(said[4] == "Kit: The game's Options have no page for addons here.", "commands: no settings page, said")
  check(
    hidden and said[5] == "Kit: Minimap button hidden (/kt minimap shows it again).",
    "commands: the minimap button hidden, said"
  )
  check(own == "WHERE", "commands: the addon's own, as typed")
  SlashCmdList, SLASH_KITTEST1, SLASH_KITTEST2 = nil, nil, nil
end

-- A book's achievements: kept quietly at the login, earned with a line and
-- the fanfare, the alert behind the addon's switch.
do
  local K = load()
  local saved, said, sounds, alertOn, shown = {}, {}, {}, false, 0
  time = time or os.time
  UnitLevel = function() return 12 end
  PlaySound = function(id)
    table.insert(sounds, id)
    return true
  end
  local A = K.deeds({
    saved = function() return saved end,
    name = "Kit Test",
    prefix = "Kit: ",
    kicker = "Kit achievement",
    alert = function() return alertOn end,
    banners = { show = function() shown = shown + 1 end },
  })
  local n = 0
  A:add("g", "one", "First", "Do one.", function() return n, 1 end)
  A:add("g", "hidden", "Secret", "Do it.", function() return 0, 1 end, function() return false end)
  n = 1
  A:check(true)
  check(saved.one and saved.one.retro and saved.one.level == 12, "deeds: quietly kept at the login")
  saved = {}
  local print0 = print
  print = function(line) table.insert(said, line) end
  A:check()
  print = print0
  check(said[1] == "Kit: Achievement earned: |cffffd100[First]|r." and sounds[1] == 12891, "deeds: a line, the fanfare")
  check(shown == 0, "deeds: no alert while its switch is off")
  check(A:count() == 1 and #A:items() == 1, "deeds: counted, the hidden one left out")
end

-- Places by the client's names: the lowest id of a shared name, the fixes
-- where the client slips, a building's places, the English names of a save;
-- made again for another client's names; never a secret.
do
  local K = load()
  local saved = C_Map
  local client = { [12] = "Elwynn Forest", [87] = "Goldshire", [5001] = "Goldshire" }
  C_Map = { GetAreaInfo = function(id) return client[id] end }
  local inside = { [41] = "Lion's Pride Inn" }
  local fixes = { [9] = "Northshire Valley" }
  local Pl = K.places({
    names = function() return { [12] = "Elwynn Forest", [87] = "Goldshire", [5001] = "Goldshire", [9] = "Northshire" } end,
    inside = function() return inside end,
    fixes = function() return fixes end,
  })
  check(
    Pl:area("Goldshire") == 87 and Pl:area("Elwynn Forest") == 12,
    "places: an area by the client's name, the lowest id"
  )
  check(Pl:area("Northshire Valley") == 9 and Pl:inside("Lion's Pride Inn") == 41, "places: a fix, a building's place")
  check(Pl:area("") == nil and Pl:area(nil) == nil and Pl:inside("Nowhere") == nil, "places: nothing for none")
  check(Pl:english("Goldshire") == 87 and Pl:english("Northshire") == 9, "places: an older save's English name")
  -- (another client: its own names, the list made again)
  client = { [12] = "Forêt d'Elwynn", [87] = "Comté-de-l'Or" }
  C_Map = { GetAreaInfo = function(id) return client[id] end }
  check(
    Pl:area("Forêt d'Elwynn") == 12 and Pl:area("Elwynn Forest") == nil,
    "places: made again for another client's names"
  )
  check(
    K.areaName(87) == "Comté-de-l'Or" and K.areaName(4) == nil and K.areaName(nil) == nil,
    "places: an area's name, none where none"
  )
  C_Map = saved
end

-- The books' window (K.book), the Options page (K.options), an achievements
-- tab (K.deedsTab): built on first showing, a whole tab over both panels, a
-- tab's select and its choice, the refresh a moment later and only while
-- shown; the page's boxes as the game's proxies; the board on its own tab.
do
  local K = load()
  local saved = { CreateFrame = CreateFrame, C_Timer = C_Timer, Settings = Settings, UISpecialFrames = UISpecialFrames }
  CreateFrame = function() return frame() end
  UISpecialFrames = {}
  local timers = {}
  C_Timer = { After = function(_, fn) table.insert(timers, fn) end }
  local log = {}
  local B = K.book({ name = "KitBook", title = "Kit", titles = { "One", "Two" }, search = "KitSearch", filter = true })
  B:add(1, {
    build = function() table.insert(log, "build 1") end,
    show = function(n) table.insert(log, "show 1 at " .. n) end,
    refresh = function(scroll) table.insert(log, "refresh 1" .. (scroll and " scroll" or "")) end,
    filter = { default = "all", options = function() return { { value = "all", text = "All" } } end },
  })
  B:add(2, {
    build = function() table.insert(log, "build 2") end,
    show = function() end,
    refresh = function() table.insert(log, "refresh 2") end,
    whole = true,
  })
  B:changed()
  check(#timers == 0, "book: nothing before it's made")
  B:open(1)
  local f = B.frame
  f.scripts.OnShow(f)
  check(
    log[1] == "build 1" and log[#log] == "refresh 1 scroll",
    "book: a tab built on first showing, refreshed to its row"
  )
  check(
    f.left.shown ~= false and f.filter.shown and B:filterOf(1) == "all",
    "book: the panels, the tab's select, its default"
  )
  B:show(2)
  check(
    f.left.shown == false and f.sheet.shown == false and f.filter.shown == false,
    "book: a whole tab puts the panels away"
  )
  B:show(1)
  f.shown = true
  log = {}
  B:changed()
  B:changed()
  check(#timers == 1 and #log == 0, "book: a batch of changes, one refresh waiting")
  timers[1]()
  check(log[1] == "refresh 1", "book: the refresh, a moment later")
  -- the Options page
  local registered = {}
  Settings = {
    VarType = { Boolean = "b", Number = "n", String = "s" },
    RegisterVerticalLayoutCategory = function()
      return { GetID = function() return 7 end }
    end,
    RegisterProxySetting = function(_, v, _, _, default, get, set)
      registered[v] = { default = default, get = get, set = set }
      return registered[v]
    end,
    CreateCheckbox = function() end,
    RegisterAddOnCategory = function() registered.done = true end,
    OpenToCategory = function(id) registered.opened = id end,
  }
  local values = { banner = true, minimapHidden = false }
  local O = K.options({
    title = "Kit",
    key = "KIT",
    get = function(k) return values[k] end,
    set = function(k, v) values[k] = v end,
    defaults = { banner = true, minimapHidden = false },
    slash = "/kit",
  })
  O:check("banner", "Banner", "A banner.")
  O:check("minimapHidden", "Minimap button", "The button.", true)
  O:done()
  registered.KIT_MINIMAPHIDDEN.set(false)
  check(
    registered.KIT_BANNER.get() == true
      and values.minimapHidden == true
      and registered.KIT_MINIMAPHIDDEN.default == true,
    "options: the proxies, an inverted box (ticked: shown)"
  )
  check(registered.done and O:open() and registered.opened == 7, "options: the page registered and opened")
  -- an achievements tab
  local A = K.deeds({ saved = function() return {} end, name = "Kit" })
  A:add("g", "one", "One", "Do it.", function() return 0, 1 end)
  local T = K.deedsTab(A, { name = "KitBoard", groups = { { "g", "G", "x", "all" } }, n = 2 })
  local book = { left = frame(), sheet = frame(), count = frame() }
  T.tab.build(book)
  T.tab.show(1)
  local hidden = T.panel.shown == false
  T.tab.show(2)
  check(hidden and T.panel.shown, "deeds tab: its board on its own tab alone")
  CreateFrame, C_Timer, Settings, UISpecialFrames =
    saved.CreateFrame, saved.C_Timer, saved.Settings, saved.UISpecialFrames
end

print(failures == 0 and "all good" or (failures .. " failed"))
os.exit(failures == 0 and 0 or 1)
