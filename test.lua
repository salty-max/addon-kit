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
  rows[1].medal.shown and not rows[2].medal.shown and rows[2].status.text == "2/5" and rows[3].status.text == "7 pages",
  "board: a medal on what is earned, how far along the rest is"
)
check(
  board.strip.tiles[1].value.text == "1/3" and board.strip.tiles[2].value.text == "1/2",
  "board: the figures, in all and by group"
)

-- A figure's label: its own size when it fits, a little smaller when it
-- wouldn't, never cut short.
do
  local strip = K.figures(UIParent)
  strip:set({ { "1", "slain" }, { "20", "a label far too long for its little tile" } }, 230)
  local fits, long = strip.tiles[1].label, strip.tiles[2].label
  check(
    fits.fontSize == 11
      and long.fontSize < 11
      and long.fontSize >= 8
      and long.text == "a label far too long for its little tile",
    "figures: a label that fits keeps its size, a long one is set smaller, whole"
  )
end

print(failures == 0 and "all good" or (failures .. " failed"))
os.exit(failures == 0 and 0 or 1)
