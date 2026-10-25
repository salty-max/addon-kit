-- A small game for an addon's tests, the family's one (the kit's copy,
-- kit:sync: edit addon-kit's wowmock.lua): frames, events and timers as the
-- game runs them, the character (a dwarf warrior of the Alliance, level 12),
-- the minimap, the map. An addon's addon/test/game.lua adds its own world
-- (reputation, cooking, a mailbox) and loads the addon:
--   local G = dofile("addon/test/wowmock.lua")
--   local state, FOREVER, LOCALE, obj = G.state, G.FOREVER, G.LOCALE, G.obj
--   ... the addon's world ...
--   G.load("Goodwill") -- its TOC, the game's order; then G.login()
--   return G
-- FOREVER=1 plays Forever's client, LOCALE=frFR a French one.
local G = {}
local state = { time = 1000, calls = {}, printed = {}, timers = {}, combat = false, talking = false }
G.state = state
local FOREVER = os.getenv("FOREVER") == "1"
local LOCALE = os.getenv("LOCALE") or "enUS"
G.FOREVER, G.LOCALE = FOREVER, LOCALE

local function call(name, ...) table.insert(state.calls, { name, ... }) end
function G.called(name)
  local n, last = 0, nil
  for _, c in ipairs(state.calls) do
    if c[1] == name then
      n = n + 1
      last = c
    end
  end
  return n, last
end
function G.forget() state.calls = {} end

-- ── frames ───────────────────────────────────────────────────────────────────
local registry = {} -- event -> frames, in registration order
local function obj(kind, name)
  local o = {
    kind = kind,
    name = name,
    shown = kind ~= "Frame" and kind ~= "Button" and kind ~= "ScrollFrame",
    scripts = {},
    events = {},
    text = nil,
    w = 0,
    h = 0,
    font = 15,
  }
  return setmetatable(o, {
    -- (a method the test game lacks does nothing, as long as it is a
    -- method: the game's are capitalized, a field the addon never set is nil)
    __index = function(self, k)
      local m = G.methods[k]
      if m then return m end
      if type(k) == "string" and k:match("^%u") then
        return function() end
      end
    end,
  })
end
G.methods = {
  Show = function(self)
    self.shown = true
    local s = self.scripts.OnShow
    if s then s(self) end
  end,
  Hide = function(self)
    local was = self.shown
    self.shown = false
    local s = self.scripts.OnHide
    if was and s then s(self) end
  end,
  IsShown = function(self) return self.shown end,
  IsVisible = function(self) return self.shown end,
  SetShown = function(self, v)
    if v then
      self:Show()
    else
      self:Hide()
    end
  end,
  SetText = function(self, t) self.text = t end,
  GetText = function(self) return self.text end,
  SetFormattedText = function(self, f, ...) self.text = f:format(...) end,
  SetScript = function(self, k, f) self.scripts[k] = f end,
  GetScript = function(self, k) return self.scripts[k] end,
  HookScript = function(self, k, f)
    local old = self.scripts[k]
    self.scripts[k] = function(...)
      if old then old(...) end
      f(...)
    end
  end,
  RegisterEvent = function(self, e)
    if G.invalidEvents[e] then error('Attempt to register unknown event "' .. e .. '"') end
    if self.events[e] then return end
    self.events[e] = true
    registry[e] = registry[e] or {}
    table.insert(registry[e], self)
  end,
  -- (a unit's event: heard for that unit alone, as the game filters it)
  RegisterUnitEvent = function(self, e, unit)
    self.unitOf = self.unitOf or {}
    self.unitOf[e] = unit
    G.methods.RegisterEvent(self, e)
  end,
  UnregisterEvent = function(self, e)
    if not self.events[e] then return end
    self.events[e] = nil
    for i, f in ipairs(registry[e] or {}) do
      if f == self then
        table.remove(registry[e], i)
        break
      end
    end
  end,
  UnregisterAllEvents = function(self)
    for e in pairs(self.events) do
      G.methods.UnregisterEvent(self, e)
    end
  end,
  IsEventRegistered = function(self, e) return self.events[e] == true end,
  SetWidth = function(self, w) self.w = w end,
  SetHeight = function(self, h) self.h = h end,
  SetSize = function(self, w, h)
    self.w, self.h = w, h
  end,
  GetWidth = function(self) return self.w end,
  GetHeight = function(self) return self.h end,
  SetFont = function(self, _, size) self.font = size end,
  GetStringHeight = function(self)
    local t = self.text or ""
    if t == "" then return 0 end
    local per = math.max(1, math.floor((self.w > 0 and self.w or 300) / (self.font * 0.55)))
    local lines = 0
    for para in (t .. "\n"):gmatch("(.-)\n") do
      lines = lines + math.max(1, math.ceil(#para / per))
    end
    return lines * (self.font + 4)
  end,
  GetStringWidth = function(self) return #(self.text or "") * self.font * 0.55 end,
  CreateTexture = function() return obj("Texture") end,
  CreateFontString = function() return obj("FontString") end,
  CreateMaskTexture = function() return obj("MaskTexture") end,
  GetPoint = function(self) return "RIGHT", UIParent, "RIGHT", -100, 20 end,
  -- (the last anchor a frame was given: what it is laid against)
  SetPoint = function(self, ...) self.point = { ... } end,
  ClearAllPoints = function(self) self.point = nil end,
  SetScrollChild = function(self, c) self.scrollChild = c end,
  GetVerticalScroll = function(self) return self.vscroll or 0 end,
  SetVerticalScroll = function(self, v) self.vscroll = v end,
  EnableKeyboard = function(self, on)
    if state.combat then error("EnableKeyboard is protected in combat") end
    self.keyboard = on
  end,
  SetPropagateKeyboardInput = function(self, on)
    if state.combat then error("SetPropagateKeyboardInput is protected in combat") end
    self.propagate = on
  end,
  GetName = function(self) return self.name end,
  SetAlpha = function(self, a) self.alpha = a end,
  SetParent = function(self, p) self.parent = p end,
  -- the game's window: its title bar, the face in its corner
  SetTitle = function(self, t) self.titleText = t end,
  SetPortraitToUnit = function(self, unit) self.face = unit end,
  SetPortraitToAsset = function(self, asset) self.face = asset end,
  GetAlpha = function(self) return self.alpha or 1 end,
  SetVertexColor = function(self, r, g, b) self.color = { r, g, b } end,
  SetScale = function(self, v) self.scale = v end,
  GetScale = function(self) return self.scale or 1 end,
  GetParent = function(self) return self.parent end,
  -- (the kit's books: levels, sizes and text as the page lays them out)
  GetFrameLevel = function(self) return self.level or 1 end,
  SetFrameLevel = function(self, v) self.level = v end,
  GetTextColor = function(self) return unpack(self.textColor or { 1, 1, 1 }) end,
  SetTextColor = function(self, r, g, b) self.textColor = { r, g, b } end,
  GetNumLines = function(self) return math.max(1, math.ceil(self:GetStringHeight() / (self.font + 4))) end,
  GetLineHeight = function(self) return self.font + 4 end,
  GetTop = function() return 500 end,
  GetBottom = function() return 100 end,
  GetLeft = function() return 100 end,
  GetRight = function() return 600 end,
  GetCenter = function() return 350, 300 end,
  GetEffectiveScale = function() return 1 end,
  IsMouseOver = function() return false end,
}

local frames = {}
function CreateFrame(kind, name, parent, template)
  local f = obj(kind, name)
  table.insert(frames, f)
  f.parent = parent
  f.template = template
  if name then _G[name] = f end
  -- (the game's window: a close button that hides it, as HideUIPanel does)
  if template == "ButtonFrameTemplate" then
    f.CloseButton = CreateFrame("Button", nil, f)
    f.CloseButton:SetScript("OnClick", function(self) self.parent:Hide() end)
  end
  -- (a tooltip of the template: it keeps its lines, as the game's does)
  if kind == "GameTooltip" then
    f.lines = {}
    function f:SetOwner() wipe(self.lines) end
    function f:AddLine(text) table.insert(self.lines, text) end
  end
  return f
end
UIParent = obj("Frame", "UIParent")
UIParent.shown = true
UIParent.w, UIParent.h = 1365, 768
GameTooltip = obj("Frame", "GameTooltip")
GameTooltip.lines = {}
function GameTooltip:SetOwner() wipe(self.lines) end
function GameTooltip:AddLine(text) table.insert(self.lines, text) end
-- (an item's tooltip: its lines, then the hooks a set item runs: Forever's
-- modern client its tooltip processor's post-calls, Classic Era the
-- tooltip's own script)
local postCalls = {}
if FOREVER then
  Enum = Enum or {}
  Enum.TooltipDataType = { Item = 0, Unit = 2 }
  TooltipDataProcessor = {
    AddTooltipPostCall = function(kind, f) table.insert(postCalls, { kind, f }) end,
  }
end
function GameTooltip:SetItemByID(id)
  wipe(self.lines)
  self.item = id
  if FOREVER then
    for _, p in ipairs(postCalls) do
      if p[1] == Enum.TooltipDataType.Item then p[2](self, { id = id }) end
    end
    return
  end
  local f = self.scripts.OnTooltipSetItem
  if f then f(self) end
end
function GameTooltip:GetItem() return "Item " .. self.item, "|Hitem:" .. self.item .. "::::|h[Item]|h" end
WorldFrame = obj("Frame", "WorldFrame")

G.invalidEvents = {}

function G.fire(e, ...)
  local list = {}
  for _, f in ipairs(registry[e] or {}) do
    table.insert(list, f)
  end
  for _, f in ipairs(list) do
    local s = f.scripts.OnEvent
    local unit = f.unitOf and f.unitOf[e]
    if s and f.events[e] and (not unit or unit == ...) then s(f, e, ...) end
  end
end

-- ── timers ───────────────────────────────────────────────────────────────────
function GetTime() return state.time end
function time() return 1790000000 + math.floor(state.time) end
C_Timer = {
  After = function(delay, fn) table.insert(state.timers, { at = state.time + delay, fn = fn }) end,
}
function G.advance(seconds)
  local stop = state.time + seconds
  -- (frames' OnUpdate, a tenth of a second at a time, before the timers due)
  local t = state.time
  while t < stop - 1e-9 do
    local step = math.min(0.1, stop - t)
    t = t + step
    for _, f in ipairs(frames) do
      local u = f.scripts.OnUpdate
      if u then u(f, step) end
    end
  end
  while true do
    table.sort(state.timers, function(a, b) return a.at < b.at end)
    local t = state.timers[1]
    if not t or t.at > stop then break end
    table.remove(state.timers, 1)
    state.time = t.at
    t.fn()
  end
  state.time = stop
end

-- ── the game's basics ────────────────────────────────────────────────────────
local BUILD = FOREVER and 16001 or 11509
function GetBuildInfo() return "x", "1", "Oct 2026", BUILD end
function GetLocale() return LOCALE end
function print(...)
  local t = {}
  for i = 1, select("#", ...) do
    t[#t + 1] = tostring(select(i, ...))
  end
  table.insert(state.printed, table.concat(t, " "))
end
function wipe(t)
  for k in pairs(t) do
    t[k] = nil
  end
  return t
end
date = os.date
function strtrim(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end
function debugstack() return "stack" end
function geterrorhandler()
  return function(err) error(err, 0) end
end
function InCombatLockdown() return state.combat end
SlashCmdList = {}
STANDARD_TEXT_FONT = "Fonts\\FRIZQT__.TTF"
UISpecialFrames = {}
SOUNDKIT = {}
-- (the game's: whether it will play, as a client with the sound says; the
-- call kept, G.called("PlaySound"))
function PlaySound(id)
  call("PlaySound", id)
  return true
end
function hooksecurefunc() end
function PanelTemplates_SetNumTabs() end
function PanelTemplates_SetTab(f, n) f.tab = n end
function PanelTemplates_TabResize() end
ITEM_QUALITY_COLORS = { [1] = { r = 1, g = 1, b = 1 }, [2] = { r = 0.1, g = 1, b = 0.1 } }

-- the character: a dwarf warrior of the Alliance, level 12 (state.sex: 2 a
-- man, 3 a woman), named in the client's language
state.guid, state.level = "Player-1-0001", 12
function UnitGUID() return state.guid end
function UnitLevel() return state.level end
function UnitFactionGroup() return state.faction or "Alliance" end
function UnitRace() return LOCALE == "frFR" and "Nain" or "Dwarf", "Dwarf", state.race or 3 end
function UnitClass() return LOCALE == "frFR" and "Guerrier" or "Warrior", "WARRIOR", state.class or 1 end
function UnitSex() return state.sex or 2 end
function UnitName() return "Tester" end
function GetRealmName() return "Realm" end

-- the minimap (its button's place: a circle around it), the cursor
Minimap = obj("Frame", "Minimap")
Minimap.shown, Minimap.w, Minimap.h = true, 140, 140
function GetCursorPosition() return 300, 300 end

-- the map: a zone's name by its AreaTable id (the game's, here a made-up
-- one for any id), where the character stands
C_Map = C_Map or {}
function C_Map.GetAreaInfo(id) return id and ("Zone " .. id) or nil end
function GetRealZoneText() return state.zone or "Zone 1" end
-- (the instance map the character is on: 0 the Eastern Kingdoms, 1 Kalimdor)
function GetInstanceInfo() return "World", "none", 0, "", 5, 0, false, state.map or 0 end

G.obj = obj

-- ── the addon ────────────────────────────────────────────────────────────────
-- Its files as the game loads them (the game's TOC, in its order, the
-- client's language in [TextLocale]), in one namespace, G.ns; G.login().
function G.load(name)
  local dir = "addon/" .. name .. "/"
  local ns = {}
  G.ns = ns
  local files = {}
  for line in io.lines(dir .. name .. (FOREVER and "_Camelot.toc" or "_Vanilla.toc")) do
    line = line:gsub("%s+$", "")
    if line ~= "" and not line:find("^#") then table.insert(files, (line:gsub("%[TextLocale%]", LOCALE))) end
  end
  for _, file in ipairs(files) do
    assert(loadfile(dir .. file))(name, ns)
  end
  function G.login()
    G.fire("ADDON_LOADED", name)
    G.fire("PLAYER_LOGIN")
  end
  return ns
end

return G
