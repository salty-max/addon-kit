-- The kit's select on each of the game's dropdowns, against stand-ins for the
-- two APIs (the menu system's DropdownButton, the older UIDropDownMenu): its
-- options, its value set and chosen, its text, its placeholder.
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

print(failures == 0 and "all good" or (failures .. " failed"))
os.exit(failures == 0 and 0 or 1)
