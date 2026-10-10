-- The kit shared by Hearthtale, Lorekeeper's Codex and Explorer's Field
-- Journal: the books' look and the pieces their windows are made of. Its
-- source is ~/code/addon-kit (Kit.lua); each addon keeps a copy, loaded into
-- its own namespace (ns.kit: no global, no clash between the three), made by
-- its kit:sync. Edit the kit, then sync: never the copy.
--
-- The look is one family: light text and gold titles on dark panels (on
-- Forever, its Professions cards; on Classic, the game's insets and the quest
-- log's dark book behind a list). Each addon gives it a theme of its own
-- (K.theme, before building anything): its accent, a tint over the panels'
-- art, the shade behind the text, the ring of its round pictures, its
-- progress bars and its highlight.
local _, ns = ...
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
-- A select: a box showing the choice and an arrow; a click opens the list of
-- options under it (a row each, the highlight, a scroll past eight of them),
-- closed by a choice or a click anywhere else (Escape closes its window).
-- The kit's own, not the game's dropdowns: Classic's and Forever's differ,
-- and either may lack the other's.
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
function K.select(parent, width, placeholder)
  local s = CreateFrame("Button", nil, parent)
  s:SetSize(width, 24)
  s.placeholder = placeholder
  local back = s:CreateTexture(nil, "BACKGROUND")
  back:SetAllPoints()
  back:SetColorTexture(0, 0, 0, 0.45)
  border(s, { T.ring[1], T.ring[2], T.ring[3], 0.7 })
  s.text = K.label(s, K.BODY_FONT, 12, T.text)
  s.text:SetPoint("LEFT", 8, 0)
  s.text:SetPoint("RIGHT", -24, 0)
  s.text:SetWordWrap(false)
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
    r.text = K.label(r, K.BODY_FONT, 12, T.text)
    r.text:SetPoint("LEFT", 6, 0)
    r.text:SetPoint("RIGHT", -6, 0)
    r.text:SetWordWrap(false)
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
-- closed by Escape (by its name: a window of K.gameWindow or K.dialog).
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
end
