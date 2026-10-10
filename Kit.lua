-- The kit shared by Hearthtale, Lorekeeper's Codex and Explorer's Field
-- Journal: the books' look and the pieces their windows are made of, each
-- character's settings (taken from another, or by a code) and the welcome
-- page that offers them. Its source is ~/code/addon-kit (Kit.lua); each
-- addon keeps a copy, loaded into its own namespace (ns.kit: no global, no
-- clash between the three), made by its kit:sync. Edit the kit, then sync:
-- never the copy.
--
-- The look is one family: light text and gold titles on dark panels (on
-- Forever, its Professions cards; on Classic, the game's insets and the quest
-- log's dark book behind a list). Each addon gives it a theme of its own
-- (K.theme, before building anything): its accent, a tint over the panels'
-- art, the shade behind the text, the ring of its round pictures, its
-- progress bars and its highlight.
local addonName, ns = ...
local K = {}
ns.kit = K

-- ── the theme ────────────────────────────────────────────────────────────────
-- T: the colours every piece reads when it is made (one table, changed in
-- place by K.theme: hold T, not its fields, before the theme is set).
--   accent (alias gold): titles, the scroll thumb, a rule's colour
--   text, soft: the body; a quieter line
--   rule: accent at a quarter, the lines under headings
--   ring: a round picture's ring, an edge
--   bar: progress
--   dim: something not yet reached (an achievement unearned)
--   tint: multiplied over the panels' art; shade: darkening behind the text
--   highlight: multiplied over the game's row highlight
local T = {}
K.T = T
local DEFAULT = {
  accent = { 0.85, 0.70, 0.42 },
  text = { 0.93, 0.88, 0.76 },
  soft = { 0.62, 0.57, 0.49 },
  ring = { 0.72, 0.56, 0.24 },
  bar = { 0.85, 0.65, 0.13 },
  dim = { 0.55, 0.53, 0.50 },
  tint = { 1, 1, 1 },
  shade = { 0.03, 0.025, 0.02, 0.55 },
  highlight = { 1, 1, 1 },
}
function K.theme(theme)
  for k, v in pairs(DEFAULT) do
    T[k] = (theme and theme[k]) or v
  end
  T.gold = T.accent
  T.rule = { T.accent[1], T.accent[2], T.accent[3], 0.25 }
end
K.theme()

-- A colour as a text code: "|cffd9b36b".
function K.hex(c) return ("|cff%02x%02x%02x"):format(c[1] * 255, c[2] * 255, c[3] * 255) end

-- ── type ─────────────────────────────────────────────────────────────────────
-- Titles in the game's own display face where the client's letters have it
-- (Latin alphabets), else the body's.
local LATIN = { enUS = true, enGB = true, frFR = true, deDE = true, esES = true, esMX = true, itIT = true, ptBR = true }
K.BODY_FONT = STANDARD_TEXT_FONT or "Fonts\\FRIZQT__.TTF"
K.TITLE_FONT = (not GetLocale or LATIN[GetLocale()]) and "Fonts\\MORPHEUS.TTF" or K.BODY_FONT

function K.label(parent, font, size, color)
  local fs = parent:CreateFontString(nil, "OVERLAY")
  fs:SetFont(font, size, "")
  fs:SetTextColor(unpack(color))
  fs:SetShadowOffset(1, -1)
  fs:SetJustifyH("LEFT")
  return fs
end

-- A thin line (the theme's rule, or a colour of its own).
function K.rule(parent, color)
  local t = parent:CreateTexture(nil, "ARTWORK")
  t:SetColorTexture(unpack(color or T.rule))
  t:SetHeight(1)
  return t
end

-- A small progress bar.
function K.bar(parent)
  local b = CreateFrame("StatusBar", nil, parent)
  b:SetStatusBarTexture("Interface\\TargetingFrame\\UI-StatusBar")
  b:SetStatusBarColor(unpack(T.bar))
  local bg = b:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints()
  bg:SetColorTexture(0, 0, 0, 0.5)
  return b
end

-- ── panels ───────────────────────────────────────────────────────────────────
-- Forever's Professions card (a dark rounded panel), cut in nine so it
-- stretches to any size without bending its corners; tinted by the theme.
local CARD_FILE, CARD_W, CARD_H = 8164414, 1024, 512
local CARD = { 1, 665, 1, 143 } -- the generic card, in the texture's pixels
local CORNER = 16
function K.card(parent)
  local f = CreateFrame("Frame", nil, parent)
  local xs = { CARD[1], CARD[1] + CORNER, CARD[2] - CORNER, CARD[2] }
  local ys = { CARD[3], CARD[3] + CORNER, CARD[4] - CORNER, CARD[4] }
  for i = 1, 3 do
    for j = 1, 3 do
      local tex = f:CreateTexture(nil, "BACKGROUND")
      tex:SetTexture(CARD_FILE)
      tex:SetTexCoord(xs[j] / CARD_W, xs[j + 1] / CARD_W, ys[i] / CARD_H, ys[i + 1] / CARD_H)
      tex:SetVertexColor(unpack(T.tint))
      if j ~= 2 then tex:SetWidth(CORNER) end
      if i ~= 2 then tex:SetHeight(CORNER) end
      -- Corners pinned to the frame's edges; edges and centre between them.
      if j == 1 then tex:SetPoint("LEFT", f, "LEFT", 0, 0) end
      if j == 2 then
        tex:SetPoint("LEFT", f, "LEFT", CORNER, 0)
        tex:SetPoint("RIGHT", f, "RIGHT", -CORNER, 0)
      end
      if j == 3 then tex:SetPoint("RIGHT", f, "RIGHT", 0, 0) end
      if i == 1 then tex:SetPoint("TOP", f, "TOP", 0, 0) end
      if i == 2 then
        tex:SetPoint("TOP", f, "TOP", 0, -CORNER)
        tex:SetPoint("BOTTOM", f, "BOTTOM", 0, CORNER)
      end
      if i == 3 then tex:SetPoint("BOTTOM", f, "BOTTOM", 0, 0) end
    end
  end
  return f
end

-- Classic's panels: the game's inset, shaded for the text; behind a list
-- (book), the quest log's dark book (TBC's two-pane log, where the game has
-- it), tinted by the theme.
function K.inset(parent, book)
  local ok, f = pcall(CreateFrame, "Frame", nil, parent, "InsetFrameTemplate")
  if not (ok and f) then f = CreateFrame("Frame", nil, parent) end
  local shade = f:CreateTexture(nil, "BACKGROUND", nil, 1)
  shade:SetPoint("TOPLEFT", 3, -3)
  shade:SetPoint("BOTTOMRIGHT", -3, 3)
  shade:SetColorTexture(unpack(T.shade))
  if not book then return f end
  local art = f:CreateTexture(nil, "BACKGROUND", nil, 2)
  art:SetPoint("TOPLEFT", 3, -3)
  art:SetPoint("BOTTOMRIGHT", -3, 3)
  if art:SetTexture("Interface\\QuestFrame\\UI-QuestLogDualPane-Left") == false then
    art:Hide()
  else
    art:SetTexCoord(20 / 512, 318 / 512, 74 / 512, 406 / 512)
    art:SetVertexColor(unpack(T.tint))
  end
  return f
end

-- The panel of this client: Forever's card, else Classic's inset.
function K.panel(parent, book)
  if ns.forever then return K.card(parent) end
  return K.inset(parent, book)
end

-- ── scrolling ────────────────────────────────────────────────────────────────
-- A scroll area moved by the mouse wheel, with a thin thumb in the accent;
-- s.child holds what scrolls (width wide). name: a global name, if wanted.
function K.scrollArea(parent, width, name)
  local s = CreateFrame("ScrollFrame", name, parent)
  local c = CreateFrame("Frame", nil, s)
  c:SetSize(width, 1)
  s:SetScrollChild(c)
  s.child = c
  s.thumb = s:CreateTexture(nil, "OVERLAY")
  s.thumb:SetColorTexture(T.accent[1], T.accent[2], T.accent[3], 0.45)
  s.thumb:SetWidth(3)
  -- (worked out here: the frame's own range may not have caught up with
  -- the child's new height yet)
  function s:Range() return math.max(0, self.child:GetHeight() - self:GetHeight()) end
  function s:UpdateThumb()
    local range, height = self:Range(), self:GetHeight()
    if range <= 0 then
      self.thumb:Hide()
      return
    end
    local size = math.max(24, height * height / (height + range))
    self.thumb:SetHeight(size)
    self.thumb:ClearAllPoints()
    self.thumb:SetPoint(
      "TOPRIGHT",
      self,
      "TOPRIGHT",
      8,
      -(height - size) * math.min(1, self:GetVerticalScroll() / range)
    )
    self.thumb:Show()
  end
  function s:ScrollTo(y)
    self:SetVerticalScroll(math.max(0, math.min(y, self:Range())))
    self:UpdateThumb()
  end
  s:EnableMouseWheel(true)
  s:SetScript("OnMouseWheel", function(self, delta) self:ScrollTo(self:GetVerticalScroll() - delta * 40) end)
  s:SetScript("OnScrollRangeChanged", function(self) self:UpdateThumb() end)
  return s
end

-- ── pictures and rows ────────────────────────────────────────────────────────
-- A round picture in a ring (p.tex: what it shows); back: a dark disc behind
-- it, for pictures that don't fill the circle.
local MASK = "Interface\\CharacterFrame\\TempPortraitAlphaMask"
function K.roundIcon(parent, size, back)
  local p = CreateFrame("Frame", nil, parent)
  p:SetSize(size, size)
  p.ring = p:CreateTexture(nil, "BACKGROUND")
  p.ring:SetTexture(MASK)
  p.ring:SetVertexColor(unpack(T.ring))
  p.ring:SetPoint("CENTER")
  p.ring:SetSize(size + 4, size + 4)
  if back then
    p.back = p:CreateTexture(nil, "BORDER")
    p.back:SetTexture(MASK)
    p.back:SetVertexColor(0.06, 0.05, 0.04)
    p.back:SetAllPoints()
  end
  p.tex = p:CreateTexture(nil, "ARTWORK")
  p.tex:SetAllPoints()
  local mask = p:CreateMaskTexture()
  mask:SetTexture(MASK, "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
  mask:SetAllPoints(p.tex)
  p.tex:AddMaskTexture(mask)
  return p
end

-- A list's row under the mouse and the one picked out: the game's quest log
-- highlight, in the theme's colour. Returns the picked-out mark (shown by the
-- caller).
K.HIGHLIGHT = "Interface\\QuestFrame\\UI-QuestTitleHighlight"
function K.highlight(row)
  row:SetHighlightTexture(K.HIGHLIGHT, "ADD")
  local hover = row:GetHighlightTexture()
  if hover and hover.SetVertexColor then hover:SetVertexColor(unpack(T.highlight)) end
  local mark = row:CreateTexture(nil, "BACKGROUND")
  mark:SetAllPoints()
  mark:SetTexture(K.HIGHLIGHT)
  mark:SetBlendMode("ADD")
  mark:SetAlpha(0.7)
  mark:SetVertexColor(unpack(T.highlight))
  return mark
end

-- ── choosing ─────────────────────────────────────────────────────────────────
-- A select: the game's own dropdown (the menu system's, where the client has
-- it: Forever; else the older UIDropDownMenu: Classic), in a box the caller
-- places; the kit's own where the client has neither (the test games).
--   s = K.select(parent, width, placeholder)   (s.placeholder: shown without a choice)
--   s:SetOptions({ { value = v, text = "..." }, ... }), s:SetValue(v), s:GetValue()
--   s.onChange = function(value) end   (a choice made by the player)
local SELECT_ROWS, SELECT_ROW = 8, 22
local catcher -- shared by every select: a click outside the open list closes it
local function border(f, color)
  for _, side in ipairs({ "TOP", "BOTTOM", "LEFT", "RIGHT" }) do
    local t = f:CreateTexture(nil, "BORDER")
    t:SetColorTexture(unpack(color))
    if side == "TOP" or side == "BOTTOM" then
      t:SetHeight(1)
      t:SetPoint(side .. "LEFT")
      t:SetPoint(side .. "RIGHT")
    else
      t:SetWidth(1)
      t:SetPoint("TOP" .. side)
      t:SetPoint("BOTTOM" .. side)
    end
  end
end
-- (a select's words: on the game's own font object first, so they always have
-- a font, then in the kit's)
local function selectLabel(parent, color)
  local fs = parent:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  fs:SetFont(K.BODY_FONT, 12, "")
  fs:SetTextColor(unpack(color))
  fs:SetJustifyH("LEFT")
  fs:SetWordWrap(false)
  return fs
end
local function kitSelect(parent, width, placeholder)
  local s = CreateFrame("Button", nil, parent)
  s:SetSize(width, 24)
  s.placeholder = placeholder
  local back = s:CreateTexture(nil, "BACKGROUND")
  back:SetAllPoints()
  back:SetColorTexture(0, 0, 0, 0.45)
  border(s, { T.ring[1], T.ring[2], T.ring[3], 0.7 })
  s.text = selectLabel(s, T.soft)
  s.text:SetPoint("LEFT", 8, 0)
  s.text:SetPoint("RIGHT", -24, 0)
  s.text:SetText(placeholder or "")
  local arrow = s:CreateTexture(nil, "ARTWORK")
  arrow:SetTexture("Interface\\Buttons\\Arrow-Down-Up")
  arrow:SetSize(14, 14)
  arrow:SetPoint("RIGHT", -6, -3)
  arrow:SetVertexColor(unpack(T.accent))
  s:SetHighlightTexture(K.HIGHLIGHT, "ADD")
  local hover = s:GetHighlightTexture()
  if hover and hover.SetVertexColor then
    hover:SetVertexColor(unpack(T.highlight))
    hover:SetAlpha(0.5)
  end

  local list = CreateFrame("Frame", nil, s)
  list:SetPoint("TOPLEFT", s, "BOTTOMLEFT", 0, -2)
  list:SetWidth(width)
  list:SetFrameStrata("FULLSCREEN_DIALOG")
  list:EnableMouse(true)
  local shade = list:CreateTexture(nil, "BACKGROUND")
  shade:SetAllPoints()
  shade:SetColorTexture(0.05, 0.04, 0.03, 0.97)
  border(list, { T.ring[1], T.ring[2], T.ring[3], 0.9 })
  local area = K.scrollArea(list, width - 14)
  area:SetPoint("TOPLEFT", 4, -4)
  area:SetPoint("BOTTOMRIGHT", -10, 4)
  list:Hide()
  list:SetScript("OnHide", function()
    if catcher then catcher:Hide() end
  end)
  s.list, s.rows, s.options = list, {}, {}
  s:SetEnabled(false) -- (until it has options)

  local function close() list:Hide() end
  local function open()
    if not catcher then
      catcher = CreateFrame("Button", nil, UIParent)
      catcher:SetAllPoints(UIParent)
      catcher:SetFrameStrata("FULLSCREEN")
      catcher:SetScript("OnClick", function(self)
        self:Hide()
        if self.list then self.list:Hide() end
      end)
    end
    catcher.list = list
    catcher:Show()
    list:Show()
  end
  s.Close = close
  s:SetScript("OnClick", function()
    if list:IsShown() then
      close()
    else
      open()
    end
  end)

  local function row(i)
    local r = s.rows[i]
    if r then return r end
    r = CreateFrame("Button", nil, area.child)
    r:SetSize(width - 14, SELECT_ROW)
    r:SetPoint("TOPLEFT", 0, -(i - 1) * SELECT_ROW)
    r.text = selectLabel(r, T.text)
    r.text:SetPoint("LEFT", 6, 0)
    r.text:SetPoint("RIGHT", -6, 0)
    r.mark = K.highlight(r)
    r:SetScript("OnClick", function(self)
      s:SetValue(self.value)
      close()
      if s.onChange then s.onChange(self.value) end
    end)
    s.rows[i] = r
    return r
  end
  function s:SetValue(v)
    local text
    for _, o in ipairs(self.options) do
      if o.value == v then text = o.text end
    end
    self.value = text and v or nil
    self.text:SetText(text or self.placeholder or "")
    self.text:SetTextColor(unpack(text and T.text or T.soft))
    for _, r in ipairs(self.rows) do
      r.mark:SetShown(r:IsShown() and r.value == self.value)
    end
  end
  function s:GetValue() return self.value end
  function s:SetOptions(options)
    self.options = options or {}
    for i, o in ipairs(self.options) do
      local r = row(i)
      r.value = o.value
      r.text:SetText(o.text)
      r:Show()
    end
    for i = #self.options + 1, #self.rows do
      self.rows[i]:Hide()
    end
    area.child:SetHeight(#self.options * SELECT_ROW)
    list:SetHeight(math.min(#self.options, SELECT_ROWS) * SELECT_ROW + 8)
    self:SetEnabled(#self.options > 0)
    if #self.options == 0 then close() end
    self:SetValue(self.value)
  end
  return s
end

-- The text of a select's value among its options, else its placeholder.
local function chosenText(s)
  for _, o in ipairs(s.options) do
    if o.value == s.value then return o.text end
  end
  return s.placeholder or ""
end
local function known(s, v)
  for _, o in ipairs(s.options) do
    if o.value == v then return true end
  end
  return false
end

-- The menu system's dropdown (Forever): radios, the chosen one's text shown.
local function menuSelect(parent, width, placeholder)
  local s = CreateFrame("Frame", nil, parent)
  s:SetSize(width, 24)
  s.placeholder, s.options = placeholder, {}
  local box = CreateFrame("DropdownButton", nil, s, "WowStyle1DropdownTemplate")
  box:SetPoint("LEFT")
  box:SetWidth(width)
  s.box = box
  local function setup()
    box:SetupMenu(function(_, root)
      for _, o in ipairs(s.options) do
        root:CreateRadio(o.text, function(v) return s.value == v end, function(v)
          s.value = v
          if s.onChange then s.onChange(v) end
        end, o.value)
      end
    end)
  end
  function s:SetOptions(options)
    self.options = options or {}
    if not known(self, self.value) then self.value = nil end
    box:SetDefaultText(self.placeholder or "")
    setup()
    box:SetEnabled(#self.options > 0)
  end
  function s:SetValue(v)
    self.value = known(self, v) and v or nil
    box:SetDefaultText(self.placeholder or "")
    box:GenerateMenu()
  end
  function s:GetValue() return self.value end
  return s
end

-- The older UIDropDownMenu (Classic): its buttons, the chosen one checked.
local dropdowns = 0
local function dropDownSelect(parent, width, placeholder)
  local s = CreateFrame("Frame", nil, parent)
  s:SetSize(width, 24)
  s.placeholder, s.options = placeholder, {}
  dropdowns = dropdowns + 1
  -- (a name of its own: the template finds its parts by it)
  local box = CreateFrame("Frame", ("%sKitSelect%d"):format(addonName or "Kit", dropdowns), s, "UIDropDownMenuTemplate")
  box:SetPoint("LEFT", -16, -2)
  UIDropDownMenu_SetWidth(box, width - 26)
  s.box = box
  UIDropDownMenu_Initialize(box, function(_, level)
    for _, o in ipairs(s.options) do
      local info = UIDropDownMenu_CreateInfo()
      info.text, info.value = o.text, o.value
      info.checked = s.value == o.value
      info.func = function(button)
        s.value = button.value
        UIDropDownMenu_SetText(box, chosenText(s))
        if s.onChange then s.onChange(button.value) end
      end
      UIDropDownMenu_AddButton(info, level)
    end
  end)
  function s:SetOptions(options)
    self.options = options or {}
    if not known(self, self.value) then self.value = nil end
    UIDropDownMenu_SetText(box, chosenText(self))
    if #self.options > 0 then
      UIDropDownMenu_EnableDropDown(box)
    else
      UIDropDownMenu_DisableDropDown(box)
    end
  end
  function s:SetValue(v)
    self.value = known(self, v) and v or nil
    UIDropDownMenu_SetText(box, chosenText(self))
  end
  function s:GetValue() return self.value end
  return s
end

function K.select(parent, width, placeholder)
  local templates = C_XMLUtil and C_XMLUtil.GetTemplateInfo
  if MenuUtil and templates and templates("WowStyle1DropdownTemplate") then
    return menuSelect(parent, width, placeholder)
  end
  if UIDropDownMenu_Initialize then return dropDownSelect(parent, width, placeholder) end
  return kitSelect(parent, width, placeholder)
end

-- ── each character's settings ────────────────────────────────────────────────
-- An addon's settings as each character's own (its profile, "Name - Realm"),
-- all in the addon's account-wide saved table, so that one character can take
-- another's: picked among this game's characters (each game keeps its saved
-- files), or from a code made anywhere (another game, another account).
--   P = K.profiles({
--     saved = function() return MyAddonSettings end, -- (made by the addon)
--     defaults = { key = value },
--     shared = { "chat", ... },      -- what a copy or a code carries, in order
--     letters = { chat = "c", ... }, -- a letter for each, in a code
--     tag = "HT1",                   -- a code's first part
--     changed = function(key) end,   -- after a change (the addon applies it)
--   })
--   P:load(seed)   at login; seed(profile, saved) fills a character's new one
--   P:get(k), P:set(k, v), P:key(), P:others(), P:copy(other) and
--   P:import(code) (false: no such character, not such a code), P:export()
--   P.onTake: after a copy or an import (the welcome page refreshes)
-- A code: "HT1:c1:t1:h0:a200", booleans as 1 and 0; a part of an unknown
-- letter is left out (a later version's), a code without a known one refused.
function K.profiles(o)
  local P = {}
  local key, profile
  local function saved()
    local t = o.saved()
    t.profiles = t.profiles or {}
    return t
  end
  function P:load(seed)
    key = ("%s - %s"):format(UnitName("player") or "?", GetRealmName() or "?")
    local t = saved()
    profile = t.profiles[key]
    if profile then return end
    profile = {}
    if seed then seed(profile, t) end
    t.profiles[key] = profile
  end
  function P:key() return key end
  function P:get(k)
    local v = profile and profile[k]
    if v == nil then return o.defaults[k] end
    return v
  end
  function P:set(k, v)
    if not profile then return end
    profile[k] = v
    if o.changed then o.changed(k) end
  end
  function P:others()
    local out = {}
    for k in pairs(saved().profiles) do
      if k ~= key then table.insert(out, k) end
    end
    table.sort(out)
    return out
  end
  local function take(from)
    for _, k in ipairs(o.shared) do
      P:set(k, from[k])
    end
    if P.onTake then P.onTake() end
  end
  function P:copy(other)
    local from = other ~= key and saved().profiles[other]
    if not from then return false end
    take(from)
    return true
  end
  function P:export()
    local parts = { o.tag }
    for _, k in ipairs(o.shared) do
      local v = P:get(k)
      if type(v) == "boolean" then v = v and 1 or 0 end
      if type(v) == "number" then table.insert(parts, o.letters[k] .. math.floor(v + 0.5)) end
    end
    return table.concat(parts, ":")
  end
  function P:import(code)
    local parts = {}
    for part in strtrim(code or ""):gmatch("[^:]+") do
      table.insert(parts, part)
    end
    if parts[1] ~= o.tag then return false end
    local byLetter = {}
    for k, letter in pairs(o.letters) do
      byLetter[letter] = k
    end
    local from, known = {}, false
    for i = 2, #parts do
      local letter, value = parts[i]:match("^(%a)(%-?%d+)$")
      local k = letter and byLetter[letter]
      if k then
        known = true
        value = tonumber(value)
        if type(o.defaults[k]) == "boolean" then
          from[k] = value ~= 0
        else
          from[k] = value
        end
      end
    end
    if not known then return false end
    for _, k in ipairs(o.shared) do
      if from[k] == nil then from[k] = P:get(k) end
    end
    take(from)
    return true
  end
  return P
end

-- ── the window ───────────────────────────────────────────────────────────────
-- The standard game window (portrait, title bar), its inset removed; art: the
-- portrait's picture, if the addon has one (else the addon sets its own).
-- Nil where the client has no such template.
function K.gameWindow(name, title, art)
  local ok, frame = pcall(CreateFrame, "Frame", name, UIParent, "ButtonFrameTemplate")
  if not ok or not frame then return nil end
  frame.kitName = name
  if ButtonFrameTemplate_HideButtonBar then ButtonFrameTemplate_HideButtonBar(frame) end
  if type(frame.Inset) == "table" then frame.Inset:Hide() end
  if art then
    if frame.SetPortraitToAsset then
      frame:SetPortraitToAsset(art)
    elseif type(frame.portrait) == "table" then
      frame.portrait:SetTexture(art)
    end
  end
  if frame.SetTitle then
    frame:SetTitle(title)
  elseif type(frame.TitleText) == "table" then
    frame.TitleText:SetText(title)
  end
  return frame
end

-- No standard window on this client: a plain dialog frame, its title and a
-- close button.
function K.dialog(name, title)
  local frame = CreateFrame("Frame", name, UIParent, "BackdropTemplate")
  frame.kitName = name
  frame:SetBackdrop({
    bgFile = "Interface\\DialogFrame\\UI-DialogBox-Background-Dark",
    edgeFile = "Interface\\DialogFrame\\UI-DialogBox-Gold-Border",
    tile = true,
    tileSize = 32,
    edgeSize = 32,
    insets = { left = 11, right = 12, top = 12, bottom = 11 },
  })
  local label = K.label(frame, K.TITLE_FONT, 16, T.accent)
  label:SetPoint("TOP", 0, -16)
  label:SetText(title)
  local close = CreateFrame("Button", nil, frame, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", -6, -6)
  return frame
end

-- The window's tabs under its bottom edge, in the style of the character
-- sheet's (the shared panel tabs where that template doesn't exist: Forever),
-- named <window's name>Tab<n> (a window of K.gameWindow or K.dialog);
-- clicked(n) when one is chosen.
local function hasTemplate(name)
  if not (C_XMLUtil and C_XMLUtil.GetTemplateInfo) then return name == "CharacterFrameTabButtonTemplate" end
  return C_XMLUtil.GetTemplateInfo(name) ~= nil
end
function K.tabs(window, titles, clicked)
  local template = hasTemplate("CharacterFrameTabButtonTemplate") and "CharacterFrameTabButtonTemplate"
    or "PanelTabButtonTemplate"
  local prefix = window.kitName .. "Tab"
  for n, text in ipairs(titles) do
    local tab = CreateFrame("Button", prefix .. n, window, template)
    tab:SetID(n)
    tab:SetText(text)
    if n == 1 then
      tab:SetPoint("TOPLEFT", window, "BOTTOMLEFT", 14, 2)
    else
      tab:SetPoint("LEFT", prefix .. (n - 1), "RIGHT", -14, 0)
    end
    tab:SetScript("OnClick", function(self)
      clicked(self:GetID())
      if PlaySound and SOUNDKIT and SOUNDKIT.IG_CHARACTER_INFO_TAB then PlaySound(SOUNDKIT.IG_CHARACTER_INFO_TAB) end
    end)
    tab:SetScript("OnShow", function(self)
      if PanelTemplates_TabResize then PanelTemplates_TabResize(self, 0) end
    end)
    if PanelTemplates_TabResize then PanelTemplates_TabResize(tab, 0) end
  end
  if PanelTemplates_SetNumTabs then PanelTemplates_SetNumTabs(window, #titles) end
end

-- A window that can be moved, kept on screen, above the game's panels, and
-- closed by Escape (by its name: a window of K.gameWindow or K.dialog); left
-- hidden, as a new frame is shown: its first Show is then a showing (OnShow).
function K.movable(window, width, height)
  window:SetSize(width, height)
  window:SetPoint("CENTER")
  window:SetFrameStrata("HIGH")
  window:SetToplevel(true)
  window:SetMovable(true)
  window:EnableMouse(true)
  window:SetClampedToScreen(true)
  window:RegisterForDrag("LeftButton")
  window:SetScript("OnDragStart", window.StartMoving)
  window:SetScript("OnDragStop", window.StopMovingOrSizing)
  table.insert(UISpecialFrames, window.kitName)
  window:Hide()
end

-- ── the welcome ──────────────────────────────────────────────────────────────
-- An addon's welcome page, once per character (K.welcomeOnce) or on demand,
-- laid out as the books' windows: on the left its logo and what it is; on the
-- right this character's choices, then another's to take, chosen among this
-- game's characters or brought by a code.
--   W = K.welcome({
--     name = "HearthtaleWelcome", title = "Welcome to Hearthtale",
--     art = an icon for the portrait, logo = a texture (Media/Logo),
--     heading = "Hearthtale", tagline = "...", intro = "...",
--     profiles = P (K.profiles),
--     choices = function() return { choice, ... } end, -- when it is built:
--       { text, hint, get, set } a box to tick;
--       with options = { { value = v, text = "..." }, ... }: a select
--     footnote = "...", open = { text = "Open the journal", click = fn },
--     exportHint = "...", importHint = "...", refused = "...",
--   })
--   W:Show(mode) ("export": with this character's code ready to copy)
local WELCOME_W, WELCOME_H, WELCOME_ROW = 780, 500, 44 -- (H with three choices; ROW: each more)
local WELCOME_LEFT, WELCOME_TEXT = 300, 412
local REFUSED = { 0.85, 0.32, 0.25 }

local function welcomeButton(parent, text, width)
  local b = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
  b:SetSize(width, 22)
  b:SetText(text)
  return b
end

function K.welcome(o)
  local W = {}
  local frame, picker, code
  local rows = {}
  local P = o.profiles

  local function say(text, colour)
    code.note:SetText(text or "")
    code.note:SetTextColor(unpack(colour or T.soft))
  end

  local function heading(parent, text, anchor, gap)
    local h = K.label(parent, K.TITLE_FONT, 15, T.accent)
    if anchor then
      h:SetPoint("TOPLEFT", anchor, "BOTTOMLEFT", 0, -(gap or 16))
    else
      h:SetPoint("TOPLEFT", 24, -18)
    end
    h:SetText(text)
    local r = K.rule(parent)
    r:SetPoint("TOPLEFT", h, "BOTTOMLEFT", 0, -5)
    r:SetWidth(WELCOME_TEXT)
    return r
  end

  -- A choice: a box to tick (its words tick it too), or a select; its name
  -- and a line on what it does.
  local function choice(parent, anchor, c)
    local row = CreateFrame("Button", nil, parent)
    row:SetSize(WELCOME_TEXT, WELCOME_ROW - 6)
    row:SetPoint("TOPLEFT", anchor, "BOTTOMLEFT", 0, -6)
    local name = K.label(row, K.BODY_FONT, 13, T.text)
    local note = K.label(row, K.BODY_FONT, 11, T.soft)
    note:SetPoint("TOPLEFT", name, "BOTTOMLEFT", 0, -3)
    name:SetText(c.text)
    note:SetText(c.hint)
    row.get, row.kind = c.get, c.options and "select" or "check"
    if c.options then
      name:SetPoint("TOPLEFT", 0, -3)
      note:SetWidth(WELCOME_TEXT - 190)
      row.select = K.select(row, 170, "")
      row.select:SetPoint("TOPRIGHT", 0, 0)
      row.select:SetOptions(c.options)
      row.select.onChange = c.set
    else
      name:SetPoint("TOPLEFT", 28, -3)
      note:SetWidth(WELCOME_TEXT - 30)
      row.box = CreateFrame("CheckButton", nil, row, "UICheckButtonTemplate")
      row.box:SetSize(26, 26)
      row.box:SetPoint("TOPLEFT", -4, 2)
      row.box:SetScript("OnClick", function(self) c.set(self:GetChecked() and true or false) end)
      row:SetScript("OnClick", function()
        row.box:SetChecked(not row.box:GetChecked())
        c.set(row.box:GetChecked() and true or false)
      end)
    end
    table.insert(rows, row)
    return row
  end

  -- The choices as they are now (after a copy, an import).
  local function refresh()
    for _, row in ipairs(rows) do
      if row.kind == "check" then
        row.box:SetChecked(row.get() and true or false)
      else
        row.select:SetValue(row.get())
      end
    end
    local options = {}
    for _, other in ipairs(P:others()) do
      table.insert(options, { value = other, text = other })
    end
    picker.select.placeholder = options[1] and "Choose a character" or "No other character yet"
    picker.select:SetOptions(options)
    picker.copy:SetEnabled(picker.select:GetValue() ~= nil)
  end
  P.onTake = function()
    if frame and frame:IsShown() then refresh() end
  end

  -- Another character of this game, chosen in a select; Copy.
  local function buildPicker(parent, anchor)
    picker = CreateFrame("Frame", nil, parent)
    picker:SetSize(WELCOME_TEXT, 26)
    picker:SetPoint("TOPLEFT", anchor, "BOTTOMLEFT", 0, -10)
    picker.copy = welcomeButton(picker, "Copy their choices", 150)
    picker.copy:SetPoint("RIGHT", 0, 0)
    picker.select = K.select(picker, WELCOME_TEXT - 160, "Choose a character")
    picker.select:SetPoint("LEFT", 0, 0)
    picker.select.onChange = function() picker.copy:SetEnabled(true) end
    picker.copy:SetScript("OnClick", function()
      local other = picker.select:GetValue()
      if other and P:copy(other) then
        refresh()
        say(("%s's choices are this character's now."):format(other), T.accent)
      end
    end)
    return picker
  end

  -- A code: this character's to copy, or one to paste.
  local function buildCode(parent, anchor)
    code = CreateFrame("Frame", nil, parent)
    code:SetSize(WELCOME_TEXT, 54)
    code:SetPoint("TOPLEFT", anchor, "BOTTOMLEFT", 0, -10)
    code.export = welcomeButton(code, "Give a code", 120)
    code.export:SetPoint("TOPLEFT", 0, 0)
    code.import = welcomeButton(code, "Use a code", 120)
    code.import:SetPoint("LEFT", code.export, "RIGHT", 8, 0)
    code.box = CreateFrame("EditBox", nil, code, "InputBoxTemplate")
    code.box:SetSize(WELCOME_TEXT - 268, 22)
    code.box:SetPoint("LEFT", code.import, "RIGHT", 14, 0)
    code.box:SetAutoFocus(false)
    code.box:SetMaxLetters(80)
    code.note = K.label(code, K.BODY_FONT, 11, T.soft)
    code.note:SetPoint("TOPLEFT", code.export, "BOTTOMLEFT", 0, -8)
    code.note:SetWidth(WELCOME_TEXT)
    code.export:SetScript("OnClick", function() W:ShowCode() end)
    code.import:SetScript("OnClick", function()
      code.mode = "import"
      code.box:SetText("")
      code.box:SetFocus()
      say(o.importHint)
    end)
    code.box:SetScript("OnEnterPressed", function(self)
      if code.mode ~= "import" then return self:ClearFocus() end
      if P:import(self:GetText()) then
        self:ClearFocus()
        refresh()
        say("The code's choices are this character's now.", T.accent)
      else
        say(o.refused, REFUSED)
      end
    end)
    code.box:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
    return code
  end

  local function build()
    local choices = o.choices()
    frame = K.gameWindow(o.name, o.title, o.art) or K.dialog(o.name, o.title)
    K.movable(frame, WELCOME_W, WELCOME_H + math.max(0, #choices - 3) * WELCOME_ROW)
    frame:SetFrameStrata("DIALOG")

    -- Left: the logo and what the addon is.
    local left = K.panel(frame, true)
    left:SetPoint("TOPLEFT", 8, -58)
    left:SetPoint("BOTTOMLEFT", 8, 8)
    left:SetWidth(WELCOME_LEFT)
    local logo = left:CreateTexture(nil, "ARTWORK")
    logo:SetTexture(o.logo)
    logo:SetSize(112, 112)
    logo:SetPoint("TOP", 0, -16)
    local title = K.label(left, K.TITLE_FONT, 28, T.accent)
    title:SetPoint("TOP", logo, "BOTTOM", 0, -8)
    title:SetJustifyH("CENTER")
    title:SetText(o.heading)
    local tagline = K.label(left, K.BODY_FONT, 12, T.soft)
    tagline:SetPoint("TOP", title, "BOTTOM", 0, -4)
    tagline:SetWidth(WELCOME_LEFT - 40)
    tagline:SetJustifyH("CENTER")
    tagline:SetText(o.tagline)
    local line = K.rule(left)
    line:SetPoint("TOP", tagline, "BOTTOM", 0, -12)
    line:SetWidth(WELCOME_LEFT - 40)
    local intro = K.label(left, K.BODY_FONT, 12, T.text)
    intro:SetPoint("TOPLEFT", line, "BOTTOMLEFT", 0, -12)
    intro:SetWidth(WELCOME_LEFT - 40)
    intro:SetSpacing(3)
    intro:SetText(o.intro)

    -- Right: this character's choices, and another's.
    local right = K.panel(frame)
    right:SetPoint("TOPLEFT", left, "TOPRIGHT", 4, 32)
    right:SetPoint("BOTTOMRIGHT", -8, 8)
    local who = P:key()
    local last = heading(right, who and ("Choices for %s"):format(who:match("^(.-) %- ") or who) or "Your choices")
    for _, c in ipairs(choices) do
      last = choice(right, last, c)
    end
    last = heading(right, "From another character", last, 14)
    last = buildPicker(right, last)
    last = buildCode(right, last)
    local footnote = K.label(right, K.BODY_FONT, 11, T.soft)
    footnote:SetPoint("TOPLEFT", last, "BOTTOMLEFT", 0, -4)
    footnote:SetWidth(WELCOME_TEXT)
    footnote:SetText(o.footnote)

    local begin = welcomeButton(right, "Begin", 110)
    begin:SetHeight(24)
    begin:SetPoint("BOTTOMRIGHT", -22, 16)
    begin:SetScript("OnClick", function() frame:Hide() end)
    if o.open then
      local open = welcomeButton(right, o.open.text, 150)
      open:SetHeight(24)
      open:SetPoint("RIGHT", begin, "LEFT", -8, 0)
      open:SetScript("OnClick", function()
        frame:Hide()
        o.open.click()
      end)
    end

    -- (built hidden: a new frame is shown, and its first Show would be no
    -- showing at all; W:Show refreshes it itself)
    frame:Hide()
    frame:SetScript("OnHide", function() P:set("welcomed", true) end)
    W.frame, W.rows, W.picker, W.code = frame, rows, picker, code -- (for the tests)
  end

  function W:Show(mode)
    if not frame then build() end
    say("")
    code.mode = nil
    code.box:SetText("")
    refresh()
    frame:Show()
    if mode == "export" then W:ShowCode() end
  end
  function W:ShowCode()
    if not frame then return W:Show("export") end
    code.mode = "export"
    code.box:SetText(P:export())
    code.box:SetFocus()
    code.box:HighlightText()
    say(o.exportHint)
  end
  return W
end

-- The welcome once per character, a few seconds after its first login, out
-- of combat (ready(): the addon has loaded the character, its profile).
function K.welcomeOnce(W, P, ready)
  local events = CreateFrame("Frame")
  local function show()
    if P:get("welcomed") or (ready and not ready()) then return end
    if InCombatLockdown() then return events:RegisterEvent("PLAYER_REGEN_ENABLED") end
    W:Show()
  end
  events:SetScript("OnEvent", function(self, event, initial)
    if event == "PLAYER_REGEN_ENABLED" then
      self:UnregisterEvent("PLAYER_REGEN_ENABLED")
      show()
    elseif initial then
      C_Timer.After(4, show)
    end
  end)
  events:RegisterEvent("PLAYER_ENTERING_WORLD")
end

-- The Options page's "Copy settings from": another character of this game
-- (the game's own dropdown, where the page is the game's). said(other): after.
function K.copySetting(category, variable, P, tooltip, said)
  if not (Settings.CreateDropdown and Settings.CreateControlTextContainer and Settings.VarType.String) then return end
  local copy = Settings.RegisterProxySetting(
    category,
    variable,
    Settings.VarType.String,
    "Copy settings from",
    "",
    function() return "" end,
    function(other)
      if other ~= "" and P:copy(other) and said then said(other) end
    end
  )
  Settings.CreateDropdown(category, copy, function()
    local options = Settings.CreateControlTextContainer()
    options:Add("", "Choose a character")
    for _, other in ipairs(P:others()) do
      options:Add(other, other)
    end
    return options:GetData()
  end, tooltip)
end
