-- The kit every addon of the family carries but Keyring (Hearthtale,
-- Lorekeeper's Codex, Yonder, Second Wind, Palaver, Mealbook, Goodwill, Yours
-- Truly): which game this is and the addon's events, its words, the books'
-- look and the pieces their windows are made of
-- (the list on the left, the page on the right and every part of a page, a
-- board of achievements, a strip of figures), the banners that tell of a deed
-- done (the game's achievement alert for an achievement earned), each
-- character's settings (taken from another, or by a code), the
-- welcome page that offers them, and the opt-in that shares what the game
-- tells of the world with the addons' database (K.collect). Its source is the addon-kit repository
-- (Kit.lua), beside the addons' own in ~/code/wow-addons; each addon keeps a
-- copy, loaded into its own namespace (ns.kit, and ns.forever and ns.tbc),
-- made by its kit:sync. Edit the kit, then sync: never the copy. Its globals,
-- shared on purpose by every copy: SaltyMaxCollector (who collects, K.collect),
-- SaltyMaxWelcomes (the welcomes' turn, K.welcomeOnce) and
-- AchievementShield_OnLoad (the achievement alert's, where the client lacks it).
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

-- ── which game ───────────────────────────────────────────────────────────────
-- World of Warcraft: Forever (the original world on the modern client,
-- interface 16xxx), TBC Anniversary (2xxxx), else Classic Era. The kit says
-- it once for the addon too (ns.forever, ns.tbc): no addon tests the number.
K.toc = GetBuildInfo and select(4, GetBuildInfo()) or 0
K.forever = K.toc >= 16000 and K.toc < 20000
K.tbc = K.toc >= 20000 and K.toc < 30000
K.classic = not K.forever and not K.tbc
K.GAME = K.forever and "forever" or K.tbc and "tbc" or "classic"
ns.forever, ns.tbc = K.forever, K.tbc
-- Forever hides some values from addons ("secret values", in combat or
-- instances): never compare or print one.
K.secret = issecretvalue or function() return false end

-- ── events ───────────────────────────────────────────────────────────────────
-- The addon's events, one frame: every listener behind its own pcall (one's
-- error is reported, the others still hear the event), an event the client
-- doesn't know never heard (registering one throws), nothing heard before
-- the login nor while ready() says no (a book not loaded, a closed one).
--   E = K.events({ login = fn (run first at PLAYER_LOGIN, protected),
--                  ready = fn (true: heard; none: always, after the login) })
--   E.on(event, fn)            heard while ready
--   E.onUnit(event, unit, fn)  one unit's (UNIT_HEALTH fires for every unit in sight): a frame a unit
--   E.always(event, fn)        heard after the login whatever ready says, after the others
--   E.knows(event)             whether this client has it (K.knows)
--   E.run(fn, ...)             fn behind the same pcall
local probe
function K.knows(event)
  probe = probe or CreateFrame("Frame")
  local ok = pcall(probe.RegisterEvent, probe, event)
  if ok then probe:UnregisterEvent(event) end
  return ok
end
local function protected(fn, ...)
  local ok, err = pcall(fn, ...)
  if not ok then geterrorhandler()(err) end
end
function K.events(o)
  o = o or {}
  local E = { run = protected, knows = K.knows }
  local frame = CreateFrame("Frame")
  local listeners, always = {}, {}
  local loggedIn = false
  local function ready() return loggedIn and (not o.ready or o.ready()) end
  frame:SetScript("OnEvent", function(_, event, ...)
    if event == "PLAYER_LOGIN" then
      loggedIn = true
      if o.login then protected(o.login) end
    end
    if ready() then
      for _, fn in ipairs(listeners[event] or {}) do
        protected(fn, ...)
      end
    end
    if loggedIn then
      for _, fn in ipairs(always[event] or {}) do
        protected(fn, ...)
      end
    end
  end)
  frame:RegisterEvent("PLAYER_LOGIN")
  local function add(list, event, fn)
    if not listeners[event] and not always[event] then pcall(frame.RegisterEvent, frame, event) end
    list[event] = list[event] or {}
    table.insert(list[event], fn)
  end
  function E.on(event, fn) add(listeners, event, fn) end
  function E.always(event, fn) add(always, event, fn) end
  local units = {}
  function E.onUnit(event, unit, fn)
    local f = units[unit]
    if not f then
      f = CreateFrame("Frame")
      f.listeners = {}
      f:SetScript("OnEvent", function(_, e, ...)
        if not ready() then return end
        for _, listener in ipairs(f.listeners[e] or {}) do
          protected(listener, ...)
        end
      end)
      units[unit] = f
    end
    if not f.listeners[event] then
      f.listeners[event] = {}
      pcall(f.RegisterUnitEvent, f, event, unit)
    end
    table.insert(f.listeners[event], fn)
  end
  E.frame = frame -- (for the tests)
  return E
end

-- ── the theme ────────────────────────────────────────────────────────────────
-- T: the colours every piece reads when it is made (one table, changed in
-- place by K.theme: hold T, not its fields, before the theme is set).
--   accent (alias gold): titles, the scroll thumb, a rule's colour
--   text, soft: the body; a quieter line
--   aside: the ink of a note in another hand (a page's aside)
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
  aside = { 0.70, 0.75, 0.80 },
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

-- ── words ────────────────────────────────────────────────────────────────────
-- Every word the kit and its addon show goes through K.L, English by default
-- (a missing word is its own English): a language's file (the addon's
-- Text_<locale>.lua, which the client loads by its own language) fills it
-- before anything is drawn, with the language's plural rule (K.isOne: is n
-- the "one" form?) and its month names (K.day).
local L = setmetatable({}, { __index = function(_, k) return k end })
K.L = L
function K.isOne(n) return n == 1 end
function K.plural(n, one, many) return K.isOne(n) and L[one] or L[many] end

-- Lowercase in the clients' alphabets (string.lower knows ASCII alone):
-- Latin-1's capitals (É, Ü, Ñ), Œ and Ÿ, and Cyrillic's (Я, Ё).
local LOWER = {}
for b = 0x80, 0x9E do
  if b ~= 0x97 then LOWER["\195" .. string.char(b)] = "\195" .. string.char(b + 32) end -- (not ×)
end
for b = 0x80, 0x8F do
  LOWER["\208" .. string.char(b)] = "\209" .. string.char(b + 16) -- Ѐ..Џ
end
for b = 0x90, 0x9F do
  LOWER["\208" .. string.char(b)] = "\208" .. string.char(b + 32) -- А..П
end
for b = 0xA0, 0xAF do
  LOWER["\208" .. string.char(b)] = "\209" .. string.char(b - 32) -- Р..Я
end
LOWER["\197\146"], LOWER["\197\184"] = "\197\147", "\195\191" -- Œ, Ÿ
function K.lower(s) return (s:lower():gsub("[\195\197\208][\128-\191]", LOWER)) end

-- A text as a search compares it: lowercase, its accents and the curly
-- apostrophes aside (a French name's ’ found by a typed '), ё as е.
local FOLD = { ["\226\128\152"] = "'", ["\226\128\153"] = "'", ["\209\145"] = "\208\181", ["\197\147"] = "oe" }
for letter, bytes in pairs({
  a = { 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5 },
  c = { 0xA7 },
  e = { 0xA8, 0xA9, 0xAA, 0xAB },
  i = { 0xAC, 0xAD, 0xAE, 0xAF },
  n = { 0xB1 },
  o = { 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB8 },
  u = { 0xB9, 0xBA, 0xBB, 0xBC },
  y = { 0xBD, 0xBF },
}) do
  for _, b in ipairs(bytes) do
    FOLD["\195" .. string.char(b)] = letter
  end
end
function K.plain(s)
  if type(s) ~= "string" then return "" end
  return (K.lower(s):gsub("\226\128[\152\153]", FOLD):gsub("[\195\197\209][\128-\191]", FOLD))
end
-- Capitals the same way ("écrit" is "ÉCRIT": the game's upper leaves a
-- letter of two bytes as it is).
local UPPER = {}
for small, capital in pairs(LOWER) do
  UPPER[capital] = small
end
function K.upper(s) return (s:upper():gsub("[\195\197\208\209][\128-\191]", UPPER)) end

-- A language's file hands its words over: K.translate(t, { swaps }) at its
-- load. t.plural names its rule (K.PLURALS: is n the "one" form? English,
-- German, Spanish, Italian: 1; French and Brazilian Portuguese: 0 and 1;
-- Russian: 1, 21, 31... but not 11; Korean and Chinese have one form); every
-- word passes K.agree (the reader's gender, the game's own token,
-- $gmasculine:feminine;) and the swaps (Classic's own names for the places
-- Forever renamed: { { Forever's, Classic's }, ... } or { [Forever's] =
-- Classic's }, the longest first, found as written).
K.PLURALS = {
  one = function(n) return n == 1 end,
  fr = function(n) return n == 0 or n == 1 end,
  ru = function(n) return n % 10 == 1 and n % 100 ~= 11 end,
  none = function() return false end,
}
function K.agree(text)
  if type(text) ~= "string" then return text end
  local female = UnitSex and UnitSex("player") == 3
  return (text:gsub("%$g([^:;]*):([^;]*);", function(m, f) return female and f or m end))
end
-- (a plain replacement: names hold the pattern's characters, "Comte-du-Lac")
local function replaced(s, from, to)
  local out, i = {}, 1
  while true do
    local a, b = s:find(from, 1 + i - 1, true)
    if not a then break end
    out[#out + 1] = s:sub(i, a - 1)
    out[#out + 1] = to
    i = b + 1
  end
  out[#out + 1] = s:sub(i)
  return table.concat(out)
end
local swapCache = setmetatable({}, { __mode = "k" })
function K.swap(text, swaps)
  if type(text) ~= "string" or not swaps then return text end
  local list = swapCache[swaps]
  if not list then
    list = {}
    for k, v in pairs(swaps) do
      if type(v) == "table" then
        list[#list + 1] = { v[1], v[2] }
      else
        list[#list + 1] = { k, v }
      end
    end
    table.sort(list, function(a, b) return #a[1] > #b[1] or (#a[1] == #b[1] and a[1] < b[1]) end)
    swapCache[swaps] = list
  end
  for _, pair in ipairs(list) do
    if text:find(pair[1], 1, true) then text = replaced(text, pair[1], pair[2]) end
  end
  return text
end
function K.translate(t, o)
  K.locale = t.locale
  K.isOne = K.PLURALS[t.plural] or K.isOne
  local swaps = o and o.swaps
  for english, word in pairs(t.words or {}) do
    L[english] = K.swap(K.agree(word), swaps)
  end
end

-- A search box's words, as K.plain makes them; whether a text holds them.
function K.query(box) return K.plain(strtrim(box and box:GetText() or "")) end
function K.finds(text, query) return query == "" or K.plain(text):find(query, 1, true) ~= nil end

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

-- A small card's backing (a banner's, a pinned card's): Forever's card, else
-- the game's tooltip edge on the theme's shade, or a colour of its own (f
-- made with BackdropTemplate).
function K.backing(f, alpha, colour)
  if ns.forever then
    f.art = K.card(f)
    f.art:SetAllPoints()
    return f.art
  end
  f:SetBackdrop({
    bgFile = "Interface\\Tooltips\\UI-Tooltip-Background",
    edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
    tile = true,
    tileSize = 16,
    edgeSize = 16,
    insets = { left = 4, right = 4, top = 4, bottom = 4 },
  })
  local c = colour or T.shade
  f:SetBackdropColor(c[1], c[2], c[3], alpha or 0.95)
  f:SetBackdropBorderColor(unpack(T.ring))
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
-- A round picture in a ring (p.tex: what it shows; p.ring); back: a dark disc
-- behind it, for pictures that don't fill the circle. The ring is the game's
-- own bevelled bronze ring (Interface/COMMON/BlueMenuRing) without the shadow
-- its file carries: the kit's Media/Ring (the metal kept, the black halo
-- dropped, centred on the metal; kit:sync copies it beside the addon's),
-- laid over the picture's edge: the round mask alone leaves steps on it. Its
-- outer edge 2 pixels past the picture's, never more (a scroll area clips
-- what reaches past its side): that edge lies at RING_EDGE of the file's half
-- width, its inner edge at 0.773 (measured on the file). K.ringColour tints it.
local MASK = "Interface\\CharacterFrame\\TempPortraitAlphaMask"
local RING, RING_EDGE = "Interface\\AddOns\\" .. (addonName or "") .. "\\Media\\Ring", 0.9744
function K.roundIcon(parent, size, back)
  local p = CreateFrame("Frame", nil, parent)
  p:SetSize(size, size)
  p.ring = p:CreateTexture(nil, "OVERLAY")
  p.ring:SetPoint("CENTER")
  if p.ring:SetTexture(RING) == false then
    -- (the file missing: the old ring, a disc a little larger behind)
    p.ring:SetDrawLayer("BACKGROUND")
    p.ring:SetTexture(MASK)
    p.ring:SetSize(size + 4, size + 4)
  else
    p.ringArt = true
    local d = 2 * (size / 2 + 2) / RING_EDGE
    p.ring:SetSize(d, d)
  end
  K.ringColour(p)
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

-- What a round picture shows, set by a function given the picture (p.tex: its
-- texture): K.icon(path), K.crest(class), K.unitPortrait(unit), or the
-- addon's own (a creature's portrait by its display id, ...).
K.ICON_CROP = { 0.08, 0.92, 0.08, 0.92 }
K.QUESTION = "Interface\\Icons\\INV_Misc_QuestionMark"
function K.icon(path)
  return function(p)
    p.display = nil
    p.tex:SetTexture(path)
    p.tex:SetTexCoord(unpack(K.ICON_CROP))
  end
end

-- A class's round crest, the game's own (its token: "HUNTER"); else the
-- fallback's icon.
K.CRESTS = "Interface\\TargetingFrame\\UI-Classes-Circles"
function K.crest(class, fallback)
  return function(p)
    local c = class and CLASS_ICON_TCOORDS and CLASS_ICON_TCOORDS[class]
    if c then
      p.display = nil
      p.tex:SetTexture(K.CRESTS)
      p.tex:SetTexCoord(unpack(c))
    else
      K.icon(fallback or K.QUESTION)(p)
    end
  end
end

-- A unit's face as its unit frame shows it ("player": the character's own).
function K.unitPortrait(unit, fallback)
  return function(p)
    if not SetPortraitTexture then return K.icon(fallback or K.QUESTION)(p) end
    p.display = nil
    p.tex:SetTexCoord(0, 1, 0, 1)
    SetPortraitTexture(p.tex, unit)
  end
end

-- A medal pinned on a round picture's lower edge: a seal's coin in a ring of
-- its colour. K.setBadge(b, seal): seal = { icon, name, text, colour }, nil:
-- none. The seal is the medal; the picture stays the subject's.
K.GOLD = { "Interface\\Icons\\INV_Misc_Coin_01", "Gold", "", { 1, 0.82, 0 } }
function K.badge(portrait, size)
  size = size or 20
  local b = K.roundIcon(portrait, size, true)
  b:SetPoint("CENTER", portrait, "BOTTOMRIGHT", -size * 0.3, size * 0.3)
  b:SetFrameLevel(portrait:GetFrameLevel() + 3)
  b:Hide()
  return b
end
function K.setBadge(b, seal)
  if not seal then
    b:Hide()
    return
  end
  b.tex:SetTexture(seal[1])
  b.tex:SetTexCoord(unpack(K.ICON_CROP))
  b:Show()
end

-- A round picture's ring: no colour, the game's own bronze; else { r, g, b }
-- laid over it (a warmer gold: { 1, 0.85, 0.45 }), grey greying it first, a
-- metal of that colour (silver: { 1, 1, 1 }, grey). Where the client lacks
-- the ring, the old disc in that colour or the theme's.
function K.ringColour(p, c, grey)
  if not p.ringArt then return p.ring:SetVertexColor(unpack(c or T.ring)) end
  p.ring:SetDesaturated(grey and true or false)
  p.ring:SetVertexColor(c and c[1] or 1, c and c[2] or 1, c and c[3] or 1)
end

-- The rings, { colour, grey } (K.ringColour's): a deed's tiers, gold, silver,
-- copper, and iron for one not done yet; rose, a boss's (rendered on the
-- ring, each apart from the plain bronze every other picture wears).
K.RINGS = {
  gold = { { 1, 0.85, 0.45 } },
  silver = { { 1, 1, 1 }, true },
  copper = { { 1, 0.68, 0.5 } },
  iron = { { 0.5, 0.5, 0.52 }, true },
  rose = { { 1, 0.72, 0.67 }, true },
}

-- A creature's ring by its rank, the game's word for it (UnitClassification's),
-- as its target frame marks one: an elite gold, a rare or a rare elite silver,
-- a boss rose; any other, none (the plain bronze).
local RANK_RINGS = { elite = "gold", rare = "silver", rareelite = "silver", worldboss = "rose", boss = "rose" }
function K.rankRing(rank) return rank and K.RINGS[RANK_RINGS[rank]] or nil end

-- A day as the books write it: "5 Oct 2026" (each language its own order).
local MONTHS = { "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" }
function K.day(at)
  local d = date("*t", at or 0)
  return L["%d %s %d"]:format(d.day, L[MONTHS[d.month]], d.year)
end

-- ── items ────────────────────────────────────────────────────────────────────
-- An item's name (the fallback while the game hasn't the item in its cache
-- yet, or keeps it secret), icon and quality.
function K.itemName(id, fallback)
  local get = (C_Item and C_Item.GetItemInfo) or GetItemInfo
  local name = get and get(id)
  if name and not (issecretvalue and issecretvalue(name)) then return name end
  return fallback
end
function K.itemIcon(id)
  if not id then return nil end
  local get = (C_Item and C_Item.GetItemIconByID) or GetItemIcon
  if not get then return nil end
  local ok, icon = pcall(get, id)
  if ok and icon and not K.secret(icon) then return icon end
end
function K.itemQuality(id)
  if C_Item and C_Item.GetItemQualityByID then return C_Item.GetItemQualityByID(id) end
  if GetItemInfo then return select(3, GetItemInfo(id)) end
end

-- ── the game's things by id ──────────────────────────────────────────────────
-- A creature's id from its GUID (a vehicle's too: "Creature-0-…-<id>-<spawn>"),
-- none for a player, an object or a secret; a unit's.
function K.npcId(guid)
  if type(guid) ~= "string" or K.secret(guid) then return nil end
  return tonumber(
    guid:match("^Creature%-%d+%-%d+%-%d+%-%d+%-(%d+)") or guid:match("^Vehicle%-%d+%-%d+%-%d+%-%d+%-(%d+)") or ""
  )
end
function K.npcOf(unit) return UnitGUID and K.npcId(UnitGUID(unit)) end
-- A spell's name in the client's language (the fallback while the game keeps
-- it secret or doesn't know it), and its icon.
function K.spellName(id, fallback)
  if not id or K.secret(id) then return fallback end
  local name
  if C_Spell and C_Spell.GetSpellName then
    name = C_Spell.GetSpellName(id)
  elseif GetSpellInfo then
    name = GetSpellInfo(id)
  end
  return type(name) == "string" and name ~= "" and not K.secret(name) and name or fallback
end
function K.spellIcon(id)
  if not id or K.secret(id) then return nil end
  local icon
  if C_Spell and C_Spell.GetSpellTexture then
    icon = C_Spell.GetSpellTexture(id)
  elseif GetSpellTexture then
    icon = GetSpellTexture(id)
  end
  if icon and not K.secret(icon) then return icon end
end
-- A quest done, as the game keeps it.
function K.questDone(id)
  if C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted then return C_QuestLog.IsQuestFlaggedCompleted(id) == true end
  if IsQuestFlaggedCompleted then return IsQuestFlaggedCompleted(id) == true end
  return false
end
-- Whether the character is among a mask's races and classes (the game's
-- masks: a race's bit is its id's, one less, but where raceBits says
-- otherwise: Forever's Skyborne, races 95 and 96, are bits 32 and 33). A mask
-- of none or 0 is everyone; a race or class the client doesn't say, no one's.
local function hasBit(mask, n)
  if not mask or mask == 0 then return true end
  if not n then return false end
  return math.floor(mask / 2 ^ (n - 1)) % 2 == 1
end
function K.forMe(races, classes, raceBits)
  local race = select(3, UnitRace("player"))
  local class = select(3, UnitClass("player"))
  local raceBit = race and ((raceBits and raceBits[race]) or race - 1)
  return hasBit(races, raceBit and raceBit + 1) and hasBit(classes, class)
end

-- ── sounds ───────────────────────────────────────────────────────────────────
-- The sounds an addon offers for a find (all from the original game's
-- interface: -1 is the sting heard on discovering a new zone, which differs
-- by race, 0 none; their names words, L[name] where shown), and the fanfare
-- of the game's achievements.
K.SOUNDS = {
  { -1, "Zone discovery" },
  { 878, "Quest complete" },
  { 3175, "Map ping" },
  { 8960, "Ready check" },
  { 836, "Page turn" },
  { 844, "Book opening (quiet)" },
  { 0, "No sound" },
}
local DISCOVERY =
  { Human = 4140, Orc = 4141, Scourge = 4142, Tauren = 4143, Troll = 4144, NightElf = 4145, Gnome = 4146, Dwarf = 4147 }
function K.playSound(id)
  if id == -1 then
    local _, race = UnitRace("player")
    id = DISCOVERY[race] or DISCOVERY.Human
  end
  if id and id > 0 and PlaySound then pcall(PlaySound, id, "Master") end
end
local FANFARE = 12891
-- (the trophy where the client lacks the fanfare: never a stop to what comes after)
function K.fanfare(fallback)
  local ok, willPlay = pcall(PlaySound, FANFARE, "Master")
  if not (ok and willPlay) then K.playSound(fallback or 878) end
end

-- ── tooltips and links ───────────────────────────────────────────────────────
-- A line added to the game's unit or item tooltips: the modern client's
-- post-call where it has one, else the tooltips' own hooks. fn(tooltip, id)
-- (the game's tooltip's unit, as it says it; an item tooltip's item id),
-- never with a secret, behind its own pcall.
function K.onUnitTooltip(fn)
  local function onUnit(tip)
    if tip ~= GameTooltip or not tip.GetUnit then return end
    local _, unit = tip:GetUnit()
    if unit and not K.secret(unit) then protected(fn, tip, unit) end
  end
  if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType then
    TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Unit, onUnit)
  elseif GameTooltip and GameTooltip.HookScript then
    GameTooltip:HookScript("OnTooltipSetUnit", onUnit)
  end
end
function K.onItemTooltip(fn)
  if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType then
    TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tip, data)
      if data and data.id and not K.secret(data.id) then protected(fn, tip, data.id) end
    end)
  else
    local function onItem(tip)
      local _, link = tip:GetItem()
      local item = type(link) == "string" and not K.secret(link) and tonumber(link:match("item:(%d+)"))
      if item then protected(fn, tip, item) end
    end
    for _, tip in ipairs({ GameTooltip, ItemRefTooltip }) do
      if tip and tip.HookScript then tip:HookScript("OnTooltipSetItem", onItem) end
    end
  end
end
-- An addon's links in chat (|H<scheme>:<target>|h[text]|h): follow(target)
-- when one is clicked, through the client's link registry, else SetItemRef.
-- The function returned writes one, in a colour of its own (the game's
-- quest yellow by default).
function K.links(scheme, follow, colour)
  local function heard(link)
    local target = type(link) == "string" and link:match("^" .. scheme .. ":(.+)$")
    if target then protected(follow, target) end
  end
  if LinkUtil and LinkUtil.RegisterLinkHandler then
    LinkUtil.RegisterLinkHandler(scheme, function(link)
      heard(link)
      return LinkProcessorResponse and LinkProcessorResponse.Handled
    end)
  elseif hooksecurefunc and SetItemRef then
    hooksecurefunc("SetItemRef", heard)
  end
  return function(target, text, c)
    return ("|cff%s|H%s:%s|h[%s]|h|r"):format(c or colour or "ffd100", scheme, target, text)
  end
end

-- Methods set on a frame (a frame's own metatable must stay as the game made it).
local function extend(frame, methods)
  for k, v in pairs(methods) do
    frame[k] = v
  end
  return frame
end

-- ── figures ──────────────────────────────────────────────────────────────────
-- A strip of figures side by side, each value large over its label, on a
-- panel of its own: s = K.figures(parent); s:set({ { value, label }, ... },
-- width) lays them out, returns its height.
local TILE_H, TILE_GAP = 50, 10
local function tile(parent)
  local t = CreateFrame("Frame", nil, parent)
  t.art = K.panel(t)
  t.art:SetAllPoints()
  t.value = K.label(t.art, K.TITLE_FONT, 20, T.gold)
  t.value:SetPoint("TOP", 0, -7)
  -- (the label held between the tile's sides, centred, on one line; its
  -- height fixed, so the text sits where a label of its own size would)
  t.label = K.label(t.art, K.BODY_FONT, 11, T.soft)
  t.label:SetPoint("BOTTOMLEFT", 4, 8)
  t.label:SetPoint("BOTTOMRIGHT", -4, 8)
  t.label:SetHeight(13)
  t.label:SetJustifyH("CENTER")
  t.label:SetJustifyV("BOTTOM")
  t.label:SetWordWrap(false)
  return t
end
-- A text's width on one line, whatever its region's (0 where it can't be told).
local function textWidth(fs)
  local get = fs.GetUnboundedStringWidth or fs.GetStringWidth
  local v = get and get(fs)
  return type(v) == "number" and v or 0
end
local function textHeight(fs)
  local v = fs.GetStringHeight and fs:GetStringHeight()
  return type(v) == "number" and v or 0
end
-- A label too wide for its tile is set a little smaller, on its one line,
-- never cut short (a translation keeps its labels short: they fit).
local function setTile(t, strip, i, w, fig)
  t:SetSize(w, TILE_H)
  t:ClearAllPoints()
  t:SetPoint("TOPLEFT", strip, "TOPLEFT", (i - 1) * (w + TILE_GAP), 0)
  t.value:SetText(fig[1])
  local size = 11
  t.label:SetFont(K.BODY_FONT, size, "")
  t.label:SetText(fig[2])
  while size > 8 and textWidth(t.label) > w - 8 do
    size = size - 1
    t.label:SetFont(K.BODY_FONT, size, "")
  end
  t:Show()
end
-- The figures as tiles on a strip, from tiles[first] on (made as needed, in
-- parent, else the strip): returns the strip's height.
local function layTiles(strip, tiles, first, figures, width, parent)
  local w = math.floor((width - (#figures - 1) * TILE_GAP) / #figures)
  strip:SetSize(width, TILE_H)
  for i, fig in ipairs(figures) do
    local t = tiles[first + i - 1] or tile(parent or strip)
    tiles[first + i - 1] = t
    setTile(t, strip, i, w, fig)
  end
  return TILE_H
end
function K.figures(parent)
  local s = CreateFrame("Frame", nil, parent)
  s.tiles = {}
  function s:set(figures, width)
    local h = layTiles(self, self.tiles, 1, figures, width)
    for i = #figures + 1, #self.tiles do
      self.tiles[i]:Hide()
    end
    return h
  end
  return s
end

-- ── the list ─────────────────────────────────────────────────────────────────
-- The column on the left of a book: rows laid out from the top, one picked
-- out (and kept in view). style(row, kind) places a row's parts for its kind
-- and returns its height; each tab has its own kinds. rows: the pool of rows
-- (made at the tab's load, for the tests); filtered: under the select of a
-- tab with one; name: the scroll area's global name, if wanted.
--   l = K.list(parent, style, rows, filtered, name)
--   l:begin(), l:add(kind, text, count) (a row), l:grow(row, by), l:gap(by),
--   l:pick(row) (the one the page shows), l:finish(scroll) (scroll false:
--   the picked row left where it is, out of view or not: a fold clicked)
K.ROW_WIDTH = 204
local List = {}

function K.list(parent, style, rows, filtered, name)
  local l = extend(K.scrollArea(parent, K.ROW_WIDTH, name), List)
  l.rows, l.style = rows or {}, style
  l:SetPoint("TOPLEFT", parent, "TOPLEFT", 12, filtered and -70 or -40)
  l:SetPoint("BOTTOMRIGHT", parent, "BOTTOMRIGHT", -18, 12)
  return l
end

function List:row(i)
  local r = self.rows[i]
  if r then return r end
  r = CreateFrame("Button", nil, self.child)
  r:SetSize(K.ROW_WIDTH, 18)
  r.text = K.label(r, K.BODY_FONT, 12, T.text)
  r.text:SetWordWrap(false)
  r.count = K.label(r, K.BODY_FONT, 10, T.soft)
  r.fold = r:CreateTexture(nil, "ARTWORK")
  r.fold:SetSize(12, 12)
  r.bar = false -- (a progress bar, made by the tab that wants one)
  r.selected = K.highlight(r)
  self.rows[i] = r
  return r
end

function List:begin()
  for _, r in ipairs(self.rows) do
    r:Hide()
  end
  self.n, self.y, self.selectedY = 0, 0, false
end

-- A row of a kind, its text and count, under the last.
function List:add(kind, text, count)
  self.n = self.n + 1
  local r = self:row(self.n)
  r:ClearAllPoints()
  r:SetPoint("TOPLEFT", 0, -self.y)
  r.kind, r.key, r.id, r.zone, r.place = kind, false, false, false, false
  r.text:ClearAllPoints()
  r.text:SetText(text)
  r.count:ClearAllPoints()
  r.count:SetText(count and tostring(count) or "")
  r.fold:ClearAllPoints()
  r.fold:Hide()
  if r.bar then r.bar:Hide() end
  r.selected:Hide()
  r:SetScript("OnClick", nil)
  local height = self.style(r, kind)
  r:SetHeight(height)
  self.y = self.y + height
  r:Show()
  return r
end

-- A row taller than its kind (a progress bar under it).
function List:grow(r, by)
  r:SetHeight(r:GetHeight() + by)
  self.y = self.y + by
end

function List:gap(by) self.y = self.y + by end

function List:pick(r)
  r.selected:Show()
  r.text:SetTextColor(1, 1, 1)
  self.selectedY = self.y
end

function List:finish(scroll)
  self.child:SetHeight(self.y + 8)
  self:UpdateThumb()
  local y = self.selectedY
  if y and scroll ~= false then
    local top, height = self:GetVerticalScroll(), self:GetHeight()
    if y - 18 < top or y > top + height then self:ScrollTo(y - height / 2) end
  end
end

-- A row's fold mark, or a button's (a fold-all beside the search): open
-- (minus) or folded (plus).
local PLUS, MINUS = "Interface\\Buttons\\UI-PlusButton-Up", "Interface\\Buttons\\UI-MinusButton-Up"
function K.fold(r, open)
  local mark = open and MINUS or PLUS
  if type(r.fold) == "table" then
    r.fold:SetTexture(mark)
  else
    r:SetNormalTexture(mark)
  end
end

-- ── the page ─────────────────────────────────────────────────────────────────
-- The sheet on the right of a book: a header (a round portrait and its medal,
-- the title, a line under it, a rule), then blocks laid out from the top: a
-- note, sections under their heading, a label and its value, cards, a
-- paragraph, a strip of figures, a creature turning in its frame, items'
-- icons, names to pick. Every page of every book is made of these.
--   p = K.page(parent, name, { width = 440, labelWidth = 110, pairs = pool })
--   p:start(title, sub, setPicture, seal) (no picture: the title to the left)
--   p:text(paragraphs), p:section(title), p:row(label, value),
--   p:card(name, facts, setPicture, click, seal), p:paragraph(text, colour),
--   p:stats({ { value, label } }), p:model(display, shape), p:items(list),
--   p:chips(list), p:place(block, height) (a block of the tab's own),
--   p:finish(keep)
K.PAGE_WIDTH, K.PAGE_HEADER_H = 440, 88
local Page = {}

function K.page(parent, name, o)
  o = o or {}
  local width = o.width or K.PAGE_WIDTH
  local p = extend(K.scrollArea(parent, width, name), Page)
  p.width, p.labelWidth, p.pairs, p.headings = width, o.labelWidth or 110, o.pairs or {}, {}
  p.cards, p.paragraphs, p.tiles, p.itemPool, p.chipPool = {}, {}, {}, {}, {}
  p.texts, p.asides, p.boxes = {}, {}, {}
  p:SetPoint("TOPLEFT", parent, "TOPLEFT", 26, -22)
  p:SetPoint("BOTTOMRIGHT", parent, "BOTTOMRIGHT", -22, 14)
  p.portrait = K.roundIcon(p.child, 64, true)
  p.portrait:SetPoint("TOPLEFT", 2, -2)
  p.portrait.badge = K.badge(p.portrait, 26)
  p.title = K.label(p.child, K.TITLE_FONT, 24, T.gold)
  p.title:SetWordWrap(false)
  p.sub = K.label(p.child, K.BODY_FONT, 12, T.soft)
  p.sub:SetPoint("TOPLEFT", p.title, "BOTTOMLEFT", 0, -7)
  local line = K.rule(p.child)
  p.headerRule = line
  line:SetPoint("TOPLEFT", 0, -76)
  line:SetPoint("TOPRIGHT", 0, -76)
  p.note = K.label(p.child, K.BODY_FONT, 13, T.text)
  p.note:SetWidth(width)
  p.note:SetSpacing(4)
  return p
end

-- (seal: a medal on the picture, K.setBadge's; ring: its ring, K.RINGS's or
-- { colour, grey }, else the plain bronze)
function Page:start(title, sub, setPicture, seal, ring)
  for _, pool in ipairs({
    self.pairs,
    self.headings,
    self.cards,
    self.paragraphs,
    self.tiles,
    self.itemPool,
    self.chipPool,
    self.texts,
    self.asides,
    self.boxes,
  }) do
    for _, x in ipairs(pool) do
      x:Hide()
    end
  end
  self.note:Hide()
  if rawget(self, "modelFrame") then self.modelFrame:Hide() end
  local pictured = setPicture and true or false
  self.title:ClearAllPoints()
  if pictured then
    self.title:SetPoint("TOPLEFT", self.portrait, "TOPRIGHT", 16, -8)
  else
    self.title:SetPoint("TOPLEFT", self.child, "TOPLEFT", 0, -10)
  end
  self.title:SetWidth(pictured and self.width - 86 or self.width)
  self.sub:SetWidth(pictured and self.width - 86 or self.width)
  self.title:SetText(title)
  self.sub:SetText(sub or "")
  self.portrait:SetShown(pictured)
  if pictured then
    self.portrait.tex:SetVertexColor(1, 1, 1)
    self.portrait.tex:SetDesaturated(false)
    setPicture(self.portrait)
  end
  K.setBadge(self.portrait.badge, pictured and seal or nil)
  K.ringColour(self.portrait, ring and ring[1], ring and ring[2])
  self.y, self.hi, self.pi, self.ci, self.qi, self.ti, self.ii, self.chi = K.PAGE_HEADER_H + 2, 0, 0, 0, 0, 0, 0, 0
  self.xi, self.ai, self.bi, self.lastCard = 0, 0, 0, nil
end

-- A block at the page's next place (a frame or a font string), so tall. (Any
-- block ends a list of cards: Page:card.)
function Page:place(block, height)
  self.lastCard = nil
  block:ClearAllPoints()
  block:SetPoint("TOPLEFT", self.child, "TOPLEFT", 0, -self.y)
  block:Show()
  self.y = self.y + height
end

-- The page's next box: where a strip of figures, a row of items or a set of
-- names is laid, each its own (one box a kind went to the place of its last
-- block, the earlier blocks' slots with it, all on the same spot). What is
-- laid in it is the page's, anchored in it: a slot reused in another box
-- isn't hidden with the box it was made in.
function Page:box()
  self.bi = self.bi + 1
  local box = self.boxes[self.bi]
  if not box then
    box = CreateFrame("Frame", nil, self.child)
    self.boxes[self.bi] = box
  end
  return box
end

-- The note at the head of a page: its paragraphs, each a string, or an aside,
-- { text, aside = true, sign = "P. F." }: a note in another hand, set in from
-- a rule in the display face and the theme's aside ink, its initials (sign)
-- under it on the right. Paragraphs between asides run together.
local ASIDE_IN = 18

function Page:textBlock(i)
  if i == 1 then return self.note end
  local fs = self.texts[i - 1]
  if not fs then
    fs = K.label(self.child, K.BODY_FONT, 13, T.text)
    fs:SetWidth(self.width)
    fs:SetSpacing(4)
    self.texts[i - 1] = fs
  end
  return fs
end

function Page:aside(p)
  self.ai = self.ai + 1
  local a = self.asides[self.ai]
  if not a then
    a = CreateFrame("Frame", nil, self.child)
    a:SetWidth(self.width)
    a.bar = a:CreateTexture(nil, "ARTWORK")
    a.bar:SetWidth(2)
    a.bar:SetPoint("TOPLEFT", 4, 0)
    a.bar:SetPoint("BOTTOMLEFT", 4, 0)
    a.text = K.label(a, K.TITLE_FONT, 15, T.aside)
    a.text:SetPoint("TOPLEFT", ASIDE_IN, 0)
    a.text:SetWidth(self.width - ASIDE_IN - 8)
    a.text:SetSpacing(3)
    a.sign = K.label(a, K.TITLE_FONT, 15, T.aside)
    a.sign:SetJustifyH("RIGHT")
    a.sign:SetWidth(self.width - ASIDE_IN - 8)
    self.asides[self.ai] = a
  end
  a.bar:SetColorTexture(T.aside[1], T.aside[2], T.aside[3], 0.5)
  a.text:SetText(p[1])
  local height = a.text:GetStringHeight()
  a.sign:SetShown(p.sign ~= nil)
  if p.sign then
    a.sign:ClearAllPoints()
    a.sign:SetPoint("TOPLEFT", ASIDE_IN, -(height + 6))
    a.sign:SetText(p.sign)
    height = height + 6 + a.sign:GetStringHeight()
  end
  a:SetHeight(height)
  self:place(a, height + 20)
end

function Page:text(paragraphs)
  if not paragraphs or #paragraphs == 0 then return end
  local run = {}
  local function flush()
    if #run == 0 then return end
    self.xi = self.xi + 1
    local fs = self:textBlock(self.xi)
    fs:SetText(table.concat(run, "\n\n"))
    self:place(fs, fs:GetStringHeight() + 20)
    run = {}
  end
  for _, p in ipairs(paragraphs) do
    if type(p) == "table" and p.aside then
      flush()
      self:aside(p)
    else
      table.insert(run, type(p) == "table" and p[1] or p)
    end
  end
  flush()
end

function Page:heading(i)
  local h = self.headings[i]
  if h then return h end
  h = CreateFrame("Frame", nil, self.child)
  h:SetSize(self.width, 24)
  h.text = K.label(h, K.TITLE_FONT, 16, T.gold)
  h.text:SetPoint("BOTTOMLEFT", 0, 5)
  h.line = K.rule(h)
  h.line:SetPoint("BOTTOMLEFT")
  h.line:SetPoint("BOTTOMRIGHT")
  self.headings[i] = h
  return h
end

function Page:section(title)
  self.hi = self.hi + 1
  local h = self:heading(self.hi)
  h.text:SetText(title)
  self:place(h, 34)
end

function Page:pair(i)
  local p = self.pairs[i]
  if p then return p end
  local w = self.labelWidth
  p = CreateFrame("Frame", nil, self.child)
  p:SetSize(self.width, 16)
  p.label = K.label(p, K.BODY_FONT, 12, T.soft)
  p.label:SetPoint("TOPLEFT", 0, 0)
  p.label:SetWidth(w)
  p.label:SetSpacing(2)
  p.value = K.label(p, K.BODY_FONT, 12, T.text)
  p.value:SetPoint("TOPLEFT", w + 8, 0)
  p.value:SetWidth(self.width - w - 8)
  p.value:SetSpacing(4)
  self.pairs[i] = p
  return p
end

-- A label and its value, side by side (nothing without a value).
function Page:row(name, value)
  if not value or value == "" then return end
  self.pi = self.pi + 1
  local p = self:pair(self.pi)
  p.label:SetText(name)
  p.value:SetText(value)
  -- (as tall as the taller of the two: a label too wide for its column takes
  -- a second line, and the next row waits for it)
  local height = math.max(16, p.value:GetStringHeight(), p.label:GetStringHeight())
  p:SetHeight(height)
  self:place(p, height + 10)
end

-- A card's row, as every book draws one: a round picture (c.portrait, its
-- medal c.badge: a face, a crest, a place) or, square, an item's or a spell's
-- slot (c.slot, the kit's); a name in the display face, a line under it
-- (c.facts), a rule below. A page's cards, and an addon's own rows (Second
-- Wind's foes, blows and lifelines). c.picture: whichever it has.
K.CARD_H = 52
function K.cardRow(parent, width, square)
  local c = CreateFrame("Button", nil, parent)
  c:SetSize(width, K.CARD_H)
  if square then
    c.slot = K.slot(c, 38)
    c.slot:SetPoint("LEFT", 5, 0)
    c.picture = c.slot
  else
    c.portrait = K.roundIcon(c, 40, true)
    c.portrait:SetPoint("LEFT", 4, 0)
    c.badge = K.badge(c.portrait, 18)
    c.picture = c.portrait
  end
  c.name = K.label(c, K.TITLE_FONT, 15, T.text)
  c.name:SetPoint("TOPLEFT", c.picture, "TOPRIGHT", 12, -2)
  c.name:SetPoint("RIGHT", -4, 0)
  c.name:SetWordWrap(false)
  c.facts = K.label(c, K.BODY_FONT, 11, T.soft)
  c.facts:SetPoint("TOPLEFT", c.name, "BOTTOMLEFT", 0, -5)
  c.facts:SetPoint("RIGHT", -4, 0)
  c.facts:SetWordWrap(false)
  c.line = K.rule(c)
  c.line:SetPoint("BOTTOMLEFT", 0, 0)
  c.line:SetPoint("BOTTOMRIGHT", 0, 0)
  return c
end

-- An item's or a spell's slot, as the game draws a bag's button (Classic's
-- ItemButtonTemplate, the frame in every client): the whole icon, as the
-- action bar shows it, never cropped (s.icon); the quick slot's frame over
-- its edge, 64 pixels to an icon of 37, a pixel down, covering the dark edge
-- every icon file carries; how many (s.count); the game's highlight.
-- K.setSlot fills it. Empty: the action bar's empty slot alone (UI-Quickslot:
-- its own frame, a dark well), in the frame's place. At the game's size, 37,
-- unless told otherwise.
K.SLOT = 37
function K.slot(parent, size)
  size = size or K.SLOT
  local s = CreateFrame("Button", nil, parent)
  s:SetSize(size, size)
  s.icon = s:CreateTexture(nil, "BORDER")
  s.icon:SetAllPoints()
  local k = size / K.SLOT
  for _, key in ipairs({ "frame", "empty" }) do
    local t = s:CreateTexture(nil, "ARTWORK")
    t:SetSize(64 * k, 64 * k)
    t:SetPoint("CENTER", 0, -k)
    s[key] = t
  end
  s.frame:SetTexture("Interface\\Buttons\\UI-Quickslot2")
  s.empty:SetTexture("Interface\\Buttons\\UI-Quickslot")
  s.empty:Hide()
  -- (an item's quality, as a bag shows it: uncommon and better)
  s.quality = s:CreateTexture(nil, "OVERLAY")
  s.quality:SetTexture("Interface\\Common\\WhiteIconFrame")
  s.quality:SetAllPoints()
  s.quality:Hide()
  s.count = s:CreateFontString(nil, "OVERLAY", "NumberFontNormal")
  s.count:SetPoint("BOTTOMRIGHT", -size * 4 / K.SLOT, size * 2 / K.SLOT)
  s:SetHighlightTexture("Interface\\Buttons\\ButtonHilight-Square", "ADD")
  return s
end

-- What a slot holds: its icon (a path or a file id; false: nothing, an empty
-- slot), how many (shown above one), an item's quality (its border, uncommon
-- and better), faded (one not had, or not ready: greyed and darkened).
function K.setSlot(s, icon, count, quality, faded)
  s.empty:SetShown(icon == false)
  s.frame:SetShown(icon ~= false)
  s.icon:SetShown(icon ~= false)
  s.icon:SetTexture(icon or K.QUESTION)
  s.icon:SetTexCoord(0, 1, 0, 1)
  s.icon:SetDesaturated(faded and true or false)
  local v = faded and 0.4 or 1
  s.icon:SetVertexColor(v, v, v)
  s.count:SetText(count and count > 1 and tostring(count) or "")
  local c = quality and quality >= 2 and ITEM_QUALITY_COLORS and ITEM_QUALITY_COLORS[quality]
  if c then s.quality:SetVertexColor(c.r, c.g, c.b) end
  s.quality:SetShown(c and true or false)
end

-- A card: a round picture (setPicture, its medal: a seal or none; its ring:
-- K.RINGS's or { colour, grey }, else the plain bronze), a name and a line
-- under it, a rule below but under a list's last; a click calls click() (nil:
-- none).
function Page:card(name, facts, setPicture, click, seal, ring)
  self.ci = self.ci + 1
  local c = self.cards[self.ci]
  if not c then
    c = K.cardRow(self.child, self.width)
    c:SetHighlightTexture(K.HIGHLIGHT, "ADD")
    c:SetScript("OnClick", function(cc)
      if cc.click then cc.click() end
    end)
    self.cards[self.ci] = c
  end
  c.click = click
  c.name:SetText(name)
  c.facts:SetText(facts or "")
  c.portrait.tex:SetVertexColor(1, 1, 1)
  c.portrait.tex:SetDesaturated(false)
  setPicture(c.portrait)
  K.setBadge(c.badge, seal)
  K.ringColour(c.portrait, ring and ring[1], ring and ring[2])
  -- (the card before it no longer the last: its rule back; none under this one
  -- till another comes)
  local before = rawget(self, "lastCard")
  if before then before.line:Show() end
  c.line:Hide()
  self:place(c, K.CARD_H + 4)
  self.lastCard = c
  return c
end

-- A paragraph of its own under a section (the head's note is the page's).
function Page:paragraph(text, color)
  self.qi = self.qi + 1
  local p = self.paragraphs[self.qi]
  if not p then
    p = K.label(self.child, K.BODY_FONT, 13, T.text)
    p:SetWidth(self.width)
    p:SetSpacing(4)
    self.paragraphs[self.qi] = p
  end
  p:SetTextColor(unpack(color or T.text))
  p:SetText(text)
  self:place(p, p:GetStringHeight() + 16)
  return p
end

-- A strip of figures side by side: { { value, label }, ... }, the value large.
function Page:stats(figures)
  local strip = self:box()
  local h = layTiles(strip, self.tiles, self.ti + 1, figures, self.width, self.child)
  self.ti = self.ti + #figures
  self:place(strip, h + 14)
end

-- A creature in a frame of its own, turning slowly (its display id); shape:
-- only its shape (the fog of the model's own light), or no frame where the
-- client can't draw a shape.
local MODEL_H = 210
function Page:model(display, shape)
  local m = rawget(self, "modelFrame")
  if not m then
    m = CreateFrame("Frame", nil, self.child)
    m:SetSize(self.width, MODEL_H)
    m.art = K.panel(m)
    m.art:SetAllPoints()
    local ok, model = pcall(CreateFrame, "PlayerModel", nil, m.art)
    if ok and model and model.SetDisplayInfo then
      model:SetPoint("TOPLEFT", 8, -8)
      model:SetPoint("BOTTOMRIGHT", -8, 8)
      model.facing = 0.4
      model:SetScript("OnUpdate", function(mm, elapsed)
        mm.facing = (mm.facing + elapsed * 0.35) % (2 * math.pi)
        if mm.SetFacing then mm:SetFacing(mm.facing) end
      end)
      m.creature = model
    end
    self.modelFrame = m
  end
  local c = m.creature
  if not (c and display and display > 0) or (shape and not c.SetFogColor) then
    m:Hide()
    return
  end
  c:ClearModel()
  c:SetDisplayInfo(display)
  if c.SetCamDistanceScale then c:SetCamDistanceScale(1.25) end
  if shape then
    c:SetFogColor(0.16, 0.14, 0.11)
    c:SetFogNear(0)
    c:SetFogFar(0.1)
  elseif c.ClearFog then
    c:ClearFog()
  elseif c.SetFogFar then
    c:SetFogFar(10000)
  end
  self:place(m, MODEL_H + 14)
end

-- A row of items' slots (the kit's, wrapping): { { item id, name, faded,
-- count, extra } }, each with the game's tooltip, its quality's border
-- (uncommon and better, as a bag's), how many (count > 1)
-- and extra(tooltip) for lines of its own; faded: one still to find (its icon
-- only, darkened).
local ITEM = K.SLOT
function Page:items(list)
  local per = math.floor((self.width + 6) / (ITEM + 6))
  local rows = math.ceil(#list / per)
  local box = self:box()
  box:SetSize(self.width, rows * (ITEM + 6))
  for i, it in ipairs(list) do
    self.ii = self.ii + 1
    local b = self.itemPool[self.ii]
    if not b then
      b = K.slot(self.child, ITEM)
      b:SetScript("OnEnter", function(bb)
        GameTooltip:SetOwner(bb, "ANCHOR_RIGHT")
        if bb.faded then
          GameTooltip:AddLine(bb.name or "?", T.soft[1], T.soft[2], T.soft[3])
          GameTooltip:AddLine(L["Still to find here."], 1, 1, 1)
        else
          if GameTooltip.SetItemByID then GameTooltip:SetItemByID(bb.itemId) end
          if bb.extra then bb.extra(GameTooltip) end
        end
        GameTooltip:Show()
      end)
      b:SetScript("OnLeave", function() GameTooltip:Hide() end)
      self.itemPool[self.ii] = b
    end
    local col, row = (i - 1) % per, math.floor((i - 1) / per)
    b:ClearAllPoints()
    b:SetPoint("TOPLEFT", box, "TOPLEFT", col * (ITEM + 6), -row * (ITEM + 6))
    b.itemId, b.name, b.faded, b.extra = it[1], it[2], it[3], it[5]
    K.setSlot(b, K.itemIcon(it[1]), it[4], not it[3] and K.itemQuality(it[1]) or nil, it[3])
    b:Show()
  end
  self:place(box, rows * (ITEM + 6) + 10)
end

-- Names to pick, two to a row: { { text, click, picked, tip } } (picked: in
-- the accent; tip: a line on hover).
local CHIP_H = 20
function Page:chips(list)
  local rows = math.ceil(#list / 2)
  local box = self:box()
  box:SetSize(self.width, rows * CHIP_H)
  local w = math.floor((self.width - 10) / 2)
  for i, ch in ipairs(list) do
    self.chi = self.chi + 1
    local b = self.chipPool[self.chi]
    if not b then
      b = CreateFrame("Button", nil, self.child)
      b.text = K.label(b, K.BODY_FONT, 12, T.text)
      b.text:SetPoint("LEFT", 6, 0)
      b.text:SetPoint("RIGHT", -4, 0)
      b.text:SetWordWrap(false)
      K.highlight(b):Hide()
      b:SetScript("OnClick", function(bb)
        if bb.click then bb.click() end
      end)
      b:SetScript("OnEnter", function(bb)
        if not bb.tip then return end
        GameTooltip:SetOwner(bb, "ANCHOR_RIGHT")
        GameTooltip:AddLine(bb.text:GetText(), T.accent[1], T.accent[2], T.accent[3])
        GameTooltip:AddLine(bb.tip, 1, 1, 1, true)
        GameTooltip:Show()
      end)
      b:SetScript("OnLeave", function() GameTooltip:Hide() end)
      self.chipPool[self.chi] = b
    end
    b:SetSize(w, CHIP_H)
    b:ClearAllPoints()
    b:SetPoint("TOPLEFT", box, "TOPLEFT", ((i - 1) % 2) * (w + 10), -math.floor((i - 1) / 2) * CHIP_H)
    b.text:SetText(ch[1])
    b.text:SetTextColor(unpack(ch[3] and T.accent or T.text))
    b.click, b.tip = ch[2], ch[4]
    b:Show()
  end
  self:place(box, rows * CHIP_H + 10)
end

-- The page's height, scrolled to the top (keep: where it was).
function Page:finish(keep)
  self.child:SetHeight(self.y + 24)
  if keep then
    self:UpdateThumb()
  else
    self:ScrollTo(0)
  end
end

-- ── a board of achievements ──────────────────────────────────────────────────
-- A whole tab of a book's achievements: the figures on top, then each group
-- under its heading (how many of it are earned), a row each: the group's
-- picture (its ring gold once earned, iron till then), the title (the accent
-- once earned),
-- what it asks, and on the right when it was earned or how far along it is
-- (a bar). A group with nothing to show is left out (no spoilers).
--   B = K.board({
--     parent = a panel, name = its scroll area's global name, width = 700,
--     groups = { { id, heading, picture (a texture, or a picture's setter), figure }, ... },
--     figures = { { key, label }, ... }, -- "all": every one shown; else a group's figure
--     items = function() return { { id, group, title, text, earned = { level, at } or nil,
--       progress = function() return done, need end, unit = "pages" (a count without an end) }, ... } end,
--   })
--   B:refresh(picked) (picked: an id picked out, brought into view)
--   (o.rows: the pool of rows, made at the tab's load, for the tests; B.rows)
local BOARD_ROW = 50
function K.board(o)
  local width = o.width or 700
  local B = { rows = o.rows or {}, headers = {} }
  local scroll = K.scrollArea(o.parent, width, o.name)
  scroll:SetPoint("TOPLEFT", 22, -18)
  scroll:SetPoint("BOTTOMRIGHT", -22, 14)
  B.scroll = scroll
  local strip = o.figures and K.figures(scroll.child)
  if strip then strip:SetPoint("TOPLEFT", 0, 0) end
  B.strip = strip

  local function row(i)
    local r = B.rows[i]
    if r then return r end
    r = CreateFrame("Frame", nil, scroll.child)
    r:SetSize(width, BOARD_ROW - 4)
    r.bg = r:CreateTexture(nil, "BACKGROUND")
    r.bg:SetAllPoints()
    r.picture = K.roundIcon(r, 34, true)
    r.picture:SetPoint("LEFT", 8, 0)
    r.title = K.label(r, K.TITLE_FONT, 15, T.gold)
    r.title:SetPoint("TOPLEFT", 54, -7)
    -- (its right edge short of the status: a long title, a long translation, cut rather than over it)
    r.title:SetWidth(width - 54 - 190)
    r.title:SetWordWrap(false)
    r.text = K.label(r, K.BODY_FONT, 11, T.soft)
    r.text:SetPoint("TOPLEFT", r.title, "BOTTOMLEFT", 0, -5)
    r.text:SetWidth(width - 200)
    r.status = K.label(r, K.BODY_FONT, 11, T.soft)
    r.status:SetPoint("TOPRIGHT", -12, -8)
    r.status:SetJustifyH("RIGHT")
    r.status:SetWidth(175)
    r.status:SetWordWrap(false)
    r.bar = K.bar(r)
    r.bar:SetSize(150, 5)
    r.bar:SetPoint("TOPRIGHT", r.status, "BOTTOMRIGHT", 0, -7)
    B.rows[i] = r
    return r
  end

  local function header(i)
    local h = B.headers[i]
    if h then return h end
    h = CreateFrame("Frame", nil, scroll.child)
    h:SetSize(width, 26)
    h.text = K.label(h, K.TITLE_FONT, 17, T.gold)
    h.text:SetPoint("BOTTOMLEFT", 2, 5)
    h.text:SetWidth(width - 110)
    h.text:SetWordWrap(false)
    h.count = K.label(h, K.BODY_FONT, 12, T.soft)
    h.count:SetPoint("BOTTOMRIGHT", -4, 6)
    h.line = K.rule(h)
    h.line:SetPoint("BOTTOMLEFT")
    h.line:SetPoint("BOTTOMRIGHT")
    B.headers[i] = h
    return h
  end

  local function fill(r, a, picture, picked)
    local earned = a.earned
    r.id = a.id
    if type(picture) == "function" then
      picture(r.picture)
    else
      K.icon(picture)(r.picture)
    end
    r.picture.tex:SetDesaturated(not earned)
    local shade = earned and 1 or 0.6
    r.picture.tex:SetVertexColor(shade, shade, shade)
    local ring = earned and K.RINGS.gold or K.RINGS.iron
    K.ringColour(r.picture, ring[1], ring[2])
    r.title:SetText(a.title)
    r.text:SetText(a.text)
    -- (a row grows with what it asks: a description on two lines is never cut)
    local height = math.max(BOARD_ROW - 4, 7 + textHeight(r.title) + 5 + textHeight(r.text) + 6)
    r:SetHeight(height)
    if earned then
      r.title:SetTextColor(unpack(T.gold))
      r.text:SetTextColor(unpack(T.text))
      -- (an achievement earned before its day was kept: its level alone, else nothing)
      r.status:SetText(
        earned.at and L["Level %d, %s"]:format(earned.level or 0, K.day(earned.at))
          or earned.level and L["Level %d"]:format(earned.level)
          or ""
      )
      r.bar:Hide()
    else
      local done, need
      if a.progress then
        done, need = a.progress()
      end
      done, need = tonumber(done) or 0, tonumber(need) or 1
      r.title:SetTextColor(unpack(T.dim))
      r.text:SetTextColor(unpack(T.soft))
      if a.unit then
        r.status:SetText(("%d %s"):format(done, a.unit))
        r.bar:Hide()
      else
        r.status:SetText(("%d/%d"):format(math.min(done, need), need))
        r.bar:SetMinMaxValues(0, math.max(need, 1))
        r.bar:SetValue(math.min(done, need))
        r.bar:SetShown(need > 1)
      end
    end
    if a.id == picked then
      r.bg:SetColorTexture(T.accent[1], T.accent[2], T.accent[3], 0.22)
    elseif earned then
      r.bg:SetColorTexture(T.bar[1], T.bar[2], T.bar[3], 0.10)
    else
      r.bg:SetColorTexture(1, 1, 1, 0.03)
    end
    return height
  end

  function B:refresh(picked)
    local byGroup, counts = {}, { all = { 0, 0 } }
    local figureOf = {}
    for _, g in ipairs(o.groups) do
      byGroup[g[1]], figureOf[g[1]] = {}, g[4]
      if g[4] then counts[g[4]] = counts[g[4]] or { 0, 0 } end
    end
    for _, a in ipairs(o.items()) do
      local shown = byGroup[a.group]
      if shown then
        table.insert(shown, a)
        local one = a.earned and 1 or 0
        for _, key in ipairs({ "all", figureOf[a.group] }) do
          counts[key][1], counts[key][2] = counts[key][1] + one, counts[key][2] + 1
        end
      end
    end
    local y = 0
    if strip then
      local figures = {}
      for _, f in ipairs(o.figures) do
        local c = counts[f[1]] or { 0, 0 }
        table.insert(figures, { ("%d/%d"):format(c[1], c[2]), f[2] })
      end
      y = strip:set(figures, width) + 14
    end
    local i, pickedY = 0, nil
    for g, group in ipairs(o.groups) do
      local shown, earned = byGroup[group[1]], 0
      for _, a in ipairs(shown) do
        if a.earned then earned = earned + 1 end
      end
      local h = header(g)
      h:SetShown(#shown > 0)
      if #shown > 0 then
        h:ClearAllPoints()
        h:SetPoint("TOPLEFT", 0, -y)
        h.text:SetText(group[2])
        h.count:SetText(L["%d of %d"]:format(earned, #shown))
        y = y + 34
        for _, a in ipairs(shown) do
          i = i + 1
          local r = row(i)
          r:ClearAllPoints()
          r:SetPoint("TOPLEFT", 0, -y)
          if a.id == picked then pickedY = y end
          local height = fill(r, a, group[3], picked)
          r:Show()
          y = y + height + 4
        end
        y = y + 12
      end
    end
    for k = i + 1, #B.rows do
      B.rows[k]:Hide()
    end
    scroll.child:SetHeight(y)
    scroll:UpdateThumb()
    if pickedY then
      local height = scroll:GetHeight()
      scroll:SetVerticalScroll(math.min(math.max(0, y - height), math.max(0, pickedY - (height - BOARD_ROW) / 2)))
      scroll:UpdateThumb()
    end
  end
  return B
end

-- ── banners ──────────────────────────────────────────────────────────────────
-- A word on something just done (a page found, a riddle read, a book closed),
-- in the book's look: a card with its round picture (a medal on it), a short
-- line, a name in the title face. It joins the game's own alerts, whose
-- container stacks it with them and with every other addon's banners, where
-- the player's interface keeps them; else it stands at the top of the screen.
-- Two at a time, the others wait their turn; each goes after a few seconds,
-- never while the mouse is on it. A click does what it is for; a right-click
-- or its cross dismisses it.
--   B = K.banners({ name = "YonderBanner", art = a fallback picture,
--                   seconds = function() return 8 end }) -- (0: until closed)
--   B:show({ picture = a picture's setter (K.icon...) or a texture, medal = a seal,
--            kicker = "A riddle read aright", title = "...", tip = "...", click = fn })
--   B.frames (named name1, name2), f.joined: in the game's alerts (for the tests)
local BANNER_W, BANNER_H, BANNERS_SHOWN, BANNERS_WAITING = 380, 66, 2, 6
function K.banners(o)
  local B = { frames = {}, waiting = {} }

  -- Where they stand: placed by the game's alert container (a frame of its
  -- own in its stack, a few pixels above the one under it), else in a column
  -- of their own from the top of the screen.
  local arrange
  arrange = function()
    local joined, y = false, -110
    for _, f in ipairs(B.frames) do
      if f.joined then
        joined = true
      elseif f:IsShown() then
        f:ClearAllPoints()
        f:SetPoint("TOP", UIParent, "TOP", 0, y)
        y = y - BANNER_H - 6
      end
    end
    -- (the container failing them: the column, from now on)
    if joined and not pcall(AlertFrame.UpdateAnchors, AlertFrame) then
      for _, f in ipairs(B.frames) do
        f.joined = false
      end
      arrange()
    end
  end
  local function join(f)
    if not (AlertFrame and AlertFrame.AddAutoAnchoredSubSystem and AlertFrame.UpdateAnchors) then return end
    f.SetAlertContainer = function(self, c) self.kitContainer = c end
    f.GetAlertContainer = function(self) return self.kitContainer end
    f.OnAlertAnchorUpdated = function(self)
      local ok, point, rel, relPoint = pcall(self.GetPoint, self, 1)
      if ok and point then self:SetPoint(point, rel, relPoint, 0, 8) end
    end
    f.joined = pcall(AlertFrame.AddAutoAnchoredSubSystem, AlertFrame, f) and f.kitContainer ~= false
  end

  local timer
  local function dismiss(f)
    if f.timer then f.timer:Cancel() end
    f.timer = false
    f:Hide()
    arrange()
    B:next()
  end
  B.dismiss = function(_, f) dismiss(f) end
  -- (gone when its time is up, but not under the mouse: then a second later)
  timer = function(f, seconds)
    if f.timer then f.timer:Cancel() end
    f.timer = false
    if not (seconds and seconds > 0 and C_Timer and C_Timer.NewTimer) then return end
    f.timer = C_Timer.NewTimer(seconds, function()
      f.timer = false
      if f:IsMouseOver() then
        timer(f, 1)
      else
        dismiss(f)
      end
    end)
  end

  local function card(i)
    local f = CreateFrame("Button", o.name .. i, UIParent, "BackdropTemplate")
    -- (every field set: none read before it is)
    f.joined, f.kitContainer, f.timer, f.click, f.tip, f.shows = false, false, false, false, false, false
    f:SetSize(BANNER_W, BANNER_H)
    f:SetFrameStrata("DIALOG")
    f:SetClampedToScreen(true)
    f:RegisterForClicks("LeftButtonUp", "RightButtonUp")
    K.backing(f)
    local body = CreateFrame("Frame", nil, f)
    body:SetAllPoints()
    body:SetFrameLevel(f:GetFrameLevel() + 4)
    f.picture = K.roundIcon(body, 42, true)
    f.picture:SetPoint("LEFT", 14, 0)
    f.medal = K.badge(f.picture, 18)
    f.kicker = K.label(body, K.BODY_FONT, 11, T.soft)
    f.kicker:SetPoint("TOPLEFT", f.picture, "TOPRIGHT", 14, -2)
    f.kicker:SetPoint("RIGHT", -30, 0)
    f.kicker:SetWordWrap(false)
    f.title = K.label(body, K.TITLE_FONT, 18, T.gold)
    f.title:SetPoint("TOPLEFT", f.kicker, "BOTTOMLEFT", 0, -4)
    f.title:SetPoint("RIGHT", -30, 0)
    f.title:SetWordWrap(false)
    f.close = CreateFrame("Button", nil, body, "UIPanelCloseButton")
    f.close:SetSize(24, 24)
    f.close:SetPoint("TOPRIGHT", -3, -3)
    f.close:SetScript("OnClick", function() dismiss(f) end)
    f:SetHighlightTexture(K.HIGHLIGHT, "ADD")
    local hover = f:GetHighlightTexture()
    if hover and hover.SetAlpha then hover:SetAlpha(0.25) end
    f:SetScript("OnEnter", function(self)
      if not self.tip then return end
      GameTooltip:SetOwner(self, "ANCHOR_BOTTOM")
      GameTooltip:AddLine(self.tip, 1, 1, 1)
      GameTooltip:Show()
    end)
    f:SetScript("OnLeave", function() GameTooltip:Hide() end)
    f:SetScript("OnClick", function(self, button)
      local click = self.click
      dismiss(self)
      if button ~= "RightButton" and click then click() end
    end)
    f:Hide()
    join(f)
    B.frames[i] = f
    return f
  end

  local function put(f, s)
    f.click, f.tip, f.shows = s.click or false, s.tip or false, s
    f.picture.tex:SetVertexColor(1, 1, 1)
    f.picture.tex:SetDesaturated(false)
    local picture = s.picture
    if type(picture) ~= "function" then picture = K.icon(picture or o.art or K.QUESTION) end
    if not pcall(picture, f.picture) then K.icon(o.art or K.QUESTION)(f.picture) end
    K.setBadge(f.medal, s.medal)
    f.kicker:SetText(s.kicker or "")
    f.title:SetText(s.title or "")
    f:Show()
    arrange()
    local seconds = o.seconds
    if type(seconds) == "function" then seconds = seconds() end
    timer(f, seconds or 8)
  end

  -- The next waiting, into a free card.
  function B:next()
    while #self.waiting > 0 do
      local free
      for i = 1, BANNERS_SHOWN do
        local f = self.frames[i] or card(i)
        if not f:IsShown() then
          free = f
          break
        end
      end
      if not free then return end
      put(free, table.remove(self.waiting, 1))
    end
  end

  function B:show(s)
    if #self.waiting >= BANNERS_WAITING then table.remove(self.waiting, 1) end
    table.insert(self.waiting, s)
    self:next()
  end

  -- Every card closed, nothing waiting.
  function B:clear()
    self.waiting = {}
    for _, f in ipairs(self.frames) do
      if f:IsShown() then
        if f.timer then f.timer:Cancel() end
        f.timer = false
        f:Hide()
      end
    end
    arrange()
  end
  return B
end

-- ── the game's achievement alert ─────────────────────────────────────────────
-- A book's own achievement (a milestone) earned: the game's achievement alert
-- itself (AchievementAlertFrameTemplate, queued among the game's alerts: two
-- at a time, six waiting), the book's picture, a short line ("Yonder
-- milestone"), its name, no points. A click opens the book there, a
-- right-click dismisses it. Where the client has no such alert, or it fails
-- to set up (said once, through o.say), the book's own banner (K.banners)
-- shows it instead.
--   A = K.achievements({ banners = B, art = a fallback picture, say = fn })
--   A:show({ picture, kicker, title, tip, click }) (as B:show's)
local ACHIEVEMENT = "AchievementAlertFrameTemplate"

-- The achievement alert's points shield runs AchievementShield_OnLoad, from
-- the game's achievement window, loaded on demand: Classic Era has no such
-- window, and Forever's doesn't define it, so every achievement alert would
-- warn. Where the game hasn't defined it, a stand-in does what it does (the
-- shield's two methods) until the game's own replaces it. (The kit's one
-- global, the game's own name, only where the game left it undefined.)
if not AchievementShield_OnLoad then
  -- selene: allow(unused_variable)
  function AchievementShield_OnLoad(self)
    self.Desaturate = AchievementShield_Desaturate or function() end
    self.Saturate = AchievementShield_Saturate or function() end
  end
end

function K.achievements(o)
  local A = {}
  local system -- nil: not made yet; false: the client has none
  local failed = false
  local function onClick(self, button, down)
    if AlertFrame_OnClick and AlertFrame_OnClick(self, button, down) then return end -- right-click: dismissed
    if self.kitClick then self.kitClick() end
  end
  local function setUp(frame, b)
    local icon = frame.Icon.Texture
    icon:SetVertexColor(1, 1, 1)
    if type(b.picture) == "function" then
      b.picture({ tex = icon })
    else
      icon:SetTexture(b.picture or o.art)
      icon:SetTexCoord(0, 1, 0, 1)
    end
    frame.Unlocked:SetText(b.kicker or "")
    frame.Name:SetText(b.title or "")
    if frame.Shield then frame.Shield:Hide() end -- no points
    frame.kitClick = b.click
    frame:SetScript("OnClick", onClick)
  end
  -- (an error setting it up, said once: the book's banner instead, this time
  -- and the next)
  local function safely(frame, b)
    local ok, err = pcall(setUp, frame, b)
    if ok then return end
    if not failed then
      failed = true
      if o.say then
        o.say(
          L["the game's achievement alert could not be set up (%s): the book shows its own banner."]:format(
            tostring(err)
          )
        )
      end
    end
    o.banners:show(b)
    return false
  end
  function A:system()
    if system == nil then
      system = false
      if
        not failed
        and AlertFrame
        and AlertFrame.AddQueuedAlertFrameSubSystem
        and C_XMLUtil
        and C_XMLUtil.GetTemplateInfo
        and C_XMLUtil.GetTemplateInfo(ACHIEVEMENT)
      then
        system = AlertFrame:AddQueuedAlertFrameSubSystem(ACHIEVEMENT, safely, 2, 6) or false
      end
    end
    return system
  end
  function A:show(b)
    local s = not failed and self:system()
    if s then return s:AddAlert(b) end
    return o.banners:show(b)
  end
  return A
end

-- ── a book's achievements ────────────────────────────────────────────────────
-- The achievements of an addon, the family's one way (the user's call, 24
-- October 2026): earned as the game's own are, its fanfare and its own alert
-- (K.achievements: the book's banner where the client lacks it), behind a
-- switch of the addon's options; a line in chat with its link; those already
-- deserved when the book first looks (an old character, at the login) kept
-- quietly. Each character earns its own, when and at what level.
--   A = K.deeds({
--     saved = function() return the character's table of earned ones (made) or nil end,
--     name = "Mealbook", prefix = ns.PREFIX, art = an icon for the alert,
--     kicker = the alert's line above the title, the addon's word ("Mealbook achievement"),
--     alert = function() return ns.option("achievementToast") end, -- the switch (none: always)
--     open = function(id) end,           -- the alert's click, the link's
--     link = function(d) return a chat link to it end, -- (none: its title in the quest yellow)
--     picture = function(d) return its alert's picture end, -- (none: art)
--     fallback = function() return a sound id where there's no fanfare end,
--     banners = an addon's K.banners (none: one made, the alert's stand-in),
--     changed = function() end,         -- after a check earned some
--     shown = function(d) end,          -- a gate on every one's being listed (a family not met yet)
--     earnHidden = true,                -- earned while still unlisted, quietly waiting there
--     before = function(saved, quiet) end, -- before a check (one withdrawn that a change undid)
--     show = function(d) end,           -- the addon's own alert instead of the kit's (its own switch)
--     onEarned = function(d, quiet) end, -- each one earned
--   })
--   A:add(group, id, title, text, progress, visible) (progress: done, need;
--   visible: shown before earned, none: always), A:earned(id), A:visible(d),
--   A:count() (earned, shown), A:check(quiet), A:items() (K.board's), A.list, A.byId
function K.deeds(o)
  local A = { list = {}, byId = {} }
  local alerts
  function A:add(group, id, title, text, progress, visible)
    local d = { group = group, id = id, title = title, text = text, progress = progress, visible = visible }
    table.insert(self.list, d)
    self.byId[id] = d
    return d
  end
  function A:earned(id)
    local t = o.saved()
    return t and t[id]
  end
  function A:visible(d)
    if self:earned(d.id) ~= nil then return true end
    if o.shown and not o.shown(d) then return false end
    return not d.visible or d.visible()
  end
  function A:count()
    local n, shown = 0, 0
    for _, d in ipairs(self.list) do
      if self:earned(d.id) then n = n + 1 end
      if self:visible(d) then shown = shown + 1 end
    end
    return n, shown
  end
  local function announce(d)
    local link = o.link and o.link(d) or ("|cffffd100[%s]|r"):format(d.title)
    print((o.prefix or "") .. L["Achievement earned: %s."]:format(link))
    K.fanfare(o.fallback and o.fallback())
    if o.show then return o.show(d) end
    if o.alert and not o.alert() then return end
    alerts = alerts
      or K.achievements({
        banners = o.banners or K.banners({ name = o.name:gsub("%W", "") .. "DeedBanner", art = o.art }),
        art = o.art,
        say = function(m) print((o.prefix or "") .. m) end,
      })
    alerts:show({
      picture = o.picture and o.picture(d) or o.art,
      kicker = o.kicker,
      title = d.title,
      tip = L["Click to see your achievements"],
      click = function()
        if o.open then o.open(d.id) end
      end,
      achievement = d.id,
    })
  end
  -- quiet: kept without a word (reached before the book looked: the login)
  function A:check(quiet)
    local t = o.saved()
    if not t then return false end
    if o.before then o.before(t, quiet) end
    local earned = false
    for _, d in ipairs(self.list) do
      if not t[d.id] and (o.earnHidden or self:visible(d)) then
        local done, need = d.progress()
        if need and need > 0 and (done or 0) >= need then
          t[d.id] = { at = time(), level = UnitLevel("player"), retro = quiet or nil }
          earned = true
          if not quiet then announce(d) end
          if o.onEarned then o.onEarned(d, quiet) end
        end
      end
    end
    if earned and o.changed then o.changed() end
    return earned
  end
  -- (the board's rows: every one shown, earned or not)
  function A:items()
    local out = {}
    for _, d in ipairs(self.list) do
      if self:visible(d) then
        table.insert(out, {
          id = d.id,
          group = d.group,
          title = d.title,
          text = type(d.text) == "function" and d.text() or d.text, -- (a line the reader's book words)
          earned = self:earned(d.id),
          progress = d.progress,
          unit = d.unit, -- (a count without an end: "pages")
        })
      end
    end
    return out
  end
  return A
end

-- The book's tab of them, over both panels: the kit's board, the count above.
--   T = K.deedsTab(A, { name = the board's scroll name, groups = K.board's, figures = (none: "all" earned),
--     rows = a pool for the tests })
--   ns.addTab(n, T.tab); T:pick(id) before opening it at one (picked out, in view)
function K.deedsTab(A, o)
  local tab = {}
  local book, panel, board, picked
  local figures = o.figures or { { "all", L["earned"] } }
  tab.tab = {
    whole = true,
    build = function(b)
      book = b
      panel = K.panel(book)
      panel:SetPoint("TOPLEFT", book.left, "TOPLEFT")
      panel:SetPoint("BOTTOMRIGHT", book.sheet, "BOTTOMRIGHT")
      board = K.board({
        parent = panel,
        name = o.name,
        groups = o.groups,
        figures = figures,
        items = function() return A:items() end,
        rows = o.rows,
      })
      tab.board, tab.panel = board, panel
    end,
    show = function(n) panel:SetShown(n == o.n) end,
    -- (the tab chosen by a click: nothing picked out any more)
    chosen = function() picked = nil end,
    refresh = function()
      local n, all = A:count()
      book.count:SetText(L["%d of %d achievements"]:format(n, all))
      board:refresh(picked)
    end,
  }
  function tab:pick(id) picked = id end
  return tab
end

-- ── choosing ─────────────────────────────────────────────────────────────────
-- A select: the game's own dropdown, in a box the caller places: the menu
-- system's (WowStyle1DropdownTemplate), which every client the family ships
-- for has (Classic Era 1.15.9 and Forever alike); the older UIDropDownMenu
-- kept for a client without it, the kit's own where there's neither (the
-- test games).
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

  local value -- (the choice: kept here, not on the frame)
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
    value = text and v or nil
    self.text:SetText(text or self.placeholder or "")
    self.text:SetTextColor(unpack(text and T.text or T.soft))
    for _, r in ipairs(self.rows) do
      r.mark:SetShown(r:IsShown() and r.value == value)
    end
  end
  function s:GetValue() return value end
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
    self:SetValue(value)
  end
  return s
end

-- The text of a value among a select's options, else its placeholder.
local function chosenText(s, value)
  for _, o in ipairs(s.options) do
    if o.value == value then return o.text end
  end
  return s.placeholder or ""
end
local function offered(s, v)
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
  local value -- (the choice: kept here, not on the frame)
  local function setup()
    box:SetupMenu(function(_, root)
      for _, o in ipairs(s.options) do
        root:CreateRadio(o.text, function(v) return value == v end, function(v)
          value = v
          if s.onChange then s.onChange(v) end
        end, o.value)
      end
    end)
  end
  function s:SetOptions(options)
    self.options = options or {}
    if not offered(self, value) then value = nil end
    box:SetDefaultText(self.placeholder or "")
    setup()
    box:SetEnabled(#self.options > 0)
  end
  function s:SetValue(v)
    value = offered(self, v) and v or nil
    box:SetDefaultText(self.placeholder or "")
    box:GenerateMenu()
  end
  function s:GetValue() return value end
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
  local value -- (the choice: kept here, not on the frame)
  UIDropDownMenu_Initialize(box, function(_, level)
    for _, o in ipairs(s.options) do
      local info = UIDropDownMenu_CreateInfo()
      info.text, info.value = o.text, o.value
      info.checked = value == o.value
      info.func = function(button)
        value = button.value
        UIDropDownMenu_SetText(box, chosenText(s, value))
        if s.onChange then s.onChange(button.value) end
      end
      UIDropDownMenu_AddButton(info, level)
    end
  end)
  function s:SetOptions(options)
    self.options = options or {}
    if not offered(self, value) then value = nil end
    UIDropDownMenu_SetText(box, chosenText(self, value))
    if #self.options > 0 then
      UIDropDownMenu_EnableDropDown(box)
    else
      UIDropDownMenu_DisableDropDown(box)
    end
  end
  function s:SetValue(v)
    value = offered(self, v) and v or nil
    UIDropDownMenu_SetText(box, chosenText(self, value))
  end
  function s:GetValue() return value end
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
--   P:onTaken(fn): fn() after a copy or an import (the welcome page, the
--   Options page refresh: every listener, P.onTake too for older callers)
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
  local taken = {}
  function P:onTaken(fn) table.insert(taken, fn) end
  local function take(from)
    for _, k in ipairs(o.shared) do
      P:set(k, from[k])
    end
    for _, fn in ipairs(taken) do
      fn()
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

-- ── what the game says of the world, shared (opt-in) ────────────────────────
-- The world's facts the game's server tells the client and no file of the
-- game holds: a quest's texts, giver and ender, a creature's level, type and
-- rank, what NPCs say, what a corpse or a chest gave. Kept only when the
-- player says yes (off by default), in the addon's account-wide table, which
-- Ravenpost sends to the addons' database (wow-data): the game's own words in
-- the player's language, so the addons know new content without waiting for
-- others. Classic Era's world and Forever's only (not TBC's, nor the Season of
-- Discovery's). Never the player's own: their name in a text becomes the game's
-- token ($N, a whole word only: Storm never takes Stormwind's letters), and a
-- word that is their class or race is marked with it ($C{Hunter}, $c{hunter},
-- $R{Night Elf}): the game may have written its token there, or the word may
-- be a name's (Hunter's Hill), which only many players' texts and the
-- database's names can tell (wow-data's players' facts resolve it). No player,
-- no chat of players.
-- One collector a session among the addons: the first that may claims it (the
-- global SaltyMaxCollector), and gives it up when its player says no.
--   C = K.collect({ saved = function() return MyAddonCollect end, prefix = ns.PREFIX })
--   (prefix: the addon's chat prefix, for the line a yes prints: Ravenpost's address)
--   C:on(), C:set(on) (the player's choice: the welcome page's, the options'),
--   C:start() at the login (after the saved tables are read)
-- Kept in saved().facts[locale] = { quest = { [id] = { title, details,
--   objectives, request, reward, giver, ender, map, x, y, b } },
--   npc = { [id] = { name, level = { lo, hi }, rank, type, family, reaction,
--   map, x, y, b } }, say = { [id] = { [text] = kind } }, gossip = { [id] =
--   { [text] = true } }, loot = { ["npc:id" | "object:id"] = { looted = n,
--   items = { [item id] = n } } } }, saved().game ("classic" | "forever").
local COLLECT_CAP = 40000 -- (facts kept at most: a saved file stays small)
-- (the units whose players a text may name: made once)
local OTHERS = { "target", "focus" }
for i = 1, 4 do
  OTHERS[#OTHERS + 1] = "party" .. i
end
for i = 1, 40 do
  OTHERS[#OTHERS + 1] = "raid" .. i
end
-- A word as a whole word: its edges where no letter goes on (the bytes of a
-- letter beyond ASCII, é, ü, я, count as letters).
local function wholeWord(word) return "%f[%w\128-\255]" .. (word:gsub("%p", "%%%0")) .. "%f[^%w\128-\255]" end
local RAVENPOST = "github.com/salty-max/ravenpost" -- (where the opt-in sends a player for Ravenpost)
local function plainText(s) return type(s) == "string" and not (issecretvalue and issecretvalue(s)) and s ~= "" end

function K.collect(o)
  local C = {}
  local facts, count, me, frame
  local function saved()
    local t = o.saved()
    t.facts = t.facts or {}
    return t
  end
  function C:on() return saved().share == true end
  function C:set(on)
    local was = C:on()
    saved().share = on and true or false
    if on then
      if not was and o.prefix then
        print(
          o.prefix
            .. L["Thank you, it's a real help. What you see will help the addons keep up with Forever, and Ravenpost sends it from this computer: %s"]:format(
              RAVENPOST
            )
        )
      end
      C:start()
    else
      -- (a no stops it: what was kept stays on this computer, and Ravenpost
      -- sends nothing while the answer is no. Said in chat, as the game's
      -- "Defaults" on its Options page can say no for every addon at once.)
      facts = nil
      if frame then frame:UnregisterAllEvents() end
      if SaltyMaxCollector == o.saved then SaltyMaxCollector = nil end
      if was and o.prefix then
        print(o.prefix .. L["Sharing what you see is off now. The addon's Options can turn it back on."])
      end
    end
  end

  -- (the player's own name as the game's token, their class and race marked
  -- with the word; a text naming another player is not kept)
  local function others(s)
    for _, u in ipairs(OTHERS) do
      local name = UnitExists(u) and UnitIsPlayer(u) and UnitName(u)
      if plainText(name) and name ~= me["$N"] and s:find(name, 1, true) then return true end
    end
  end
  local function tokens(s)
    if not plainText(s) then return nil end
    if me["$N"] ~= "" then s = s:gsub(wholeWord(me["$N"]), "$N") end
    for _, token in ipairs({ "$C", "$R" }) do
      local word = me[token]
      if word ~= "" then
        s = s:gsub(wholeWord(word), token .. "{" .. word .. "}")
        local lower = K.lower(word)
        if lower ~= word then s = s:gsub(wholeWord(lower), token:lower() .. "{" .. lower .. "}") end
      end
    end
    if others(s) then return nil end
    return s
  end
  local function idOf(guid)
    if not plainText(guid) then return end
    local kind, id = guid:match("^(%a+)%-%d+%-%d+%-%d+%-%d+%-(%d+)")
    if kind == "Creature" or kind == "Vehicle" then return "npc", tonumber(id) end
    if kind == "GameObject" then return "object", tonumber(id) end
  end
  local function where()
    local map = C_Map and C_Map.GetBestMapForUnit and C_Map.GetBestMapForUnit("player")
    local pos = map and C_Map.GetPlayerMapPosition and C_Map.GetPlayerMapPosition(map, "player")
    if not pos then return map end
    local x, y = pos:GetXY()
    if not x or (issecretvalue and issecretvalue(x)) then return map end
    return map, math.floor(x * 1000 + 0.5) / 10, math.floor(y * 1000 + 0.5) / 10
  end
  local function shelf(kind)
    facts[kind] = facts[kind] or {}
    return facts[kind]
  end
  local function room() return count < COLLECT_CAP end
  local function entry(kind, id)
    local s = shelf(kind)
    if not s[id] then
      if not room() then return end
      count = count + 1
      s[id] = { b = select(2, GetBuildInfo()) }
    end
    return s[id]
  end
  local function put(e, k, v)
    if e and v ~= nil and e[k] == nil then e[k] = v end
  end
  -- The creature types' or families' words, in the client's language, to their ids.
  local words = {}
  local function wordIds(what)
    if words[what] then return words[what] end
    local out, info = {}, C_CreatureInfo or {}
    local list = info["GetCreature" .. what .. "IDs"] and info["GetCreature" .. what .. "IDs"]() or {}
    for _, id in ipairs(list) do
      local t = info["GetCreature" .. what .. "Info"](id)
      if t and type(t.name) == "string" and t.name ~= "" then out[t.name] = id end
    end
    words[what] = out
    return out
  end

  local function quest(event)
    local id = GetQuestID and GetQuestID()
    if not id or id == 0 then return end
    local e = entry("quest", id)
    if not e then return end
    local kind, npc = idOf(UnitGUID("questnpc") or UnitGUID("npc"))
    local who = npc and (kind .. ":" .. npc)
    if event == "QUEST_DETAIL" then
      put(e, "title", tokens(GetTitleText()))
      put(e, "details", tokens(GetQuestText()))
      put(e, "objectives", tokens(GetObjectiveText()))
      put(e, "giver", who)
      if e.map == nil then
        e.map, e.x, e.y = where()
      end
    elseif event == "QUEST_PROGRESS" then
      put(e, "request", tokens(GetProgressText()))
      put(e, "ender", who)
    elseif event == "QUEST_COMPLETE" then
      put(e, "reward", tokens(GetRewardText()))
      put(e, "ender", who)
    end
  end
  local function unit(u)
    if not UnitExists(u) or UnitIsPlayer(u) then return end
    -- Summons can have Creature GUIDs too. Their names, levels and positions
    -- describe a player's companion, not a creature living in the world.
    local controlled = UnitPlayerControlled(u)
    if (issecretvalue and issecretvalue(controlled)) or controlled then return end
    local kind, id = idOf(UnitGUID(u))
    if kind ~= "npc" then return end
    local name, level = UnitName(u), UnitLevel(u)
    if not plainText(name) or (issecretvalue and issecretvalue(level)) then return end
    local e = entry("npc", id)
    if not e then return end
    e.world = true -- the inbox rejects observations from before this check
    put(e, "name", name)
    if type(level) == "number" and level > 0 then
      e.level = e.level or { level, level }
      e.level[1], e.level[2] = math.min(e.level[1], level), math.max(e.level[2], level)
    end
    local rank, ctype, family = UnitClassification(u), UnitCreatureType(u), UnitCreatureFamily(u)
    if plainText(rank) then put(e, "rank", rank) end
    -- (a type and a family by their ids, the game's word only where it has none)
    if plainText(ctype) then
      local typeId = wordIds("Type")[ctype]
      if typeId then
        put(e, "typeId", typeId)
      else
        put(e, "type", ctype)
      end
    end
    if plainText(family) then
      local familyId = wordIds("Family")[family]
      if familyId then
        put(e, "familyId", familyId)
      else
        put(e, "family", family)
      end
    end
    local reaction = UnitReaction(u, "player")
    if type(reaction) == "number" and not (issecretvalue and issecretvalue(reaction)) then
      put(e, "reaction", reaction)
    end
    if e.map == nil then
      e.map, e.x, e.y = where()
    end
  end
  local function said(kind, text, guid)
    local what, id = idOf(guid)
    text = tokens(text)
    if what ~= "npc" or not text then return end
    local s = shelf("say")
    if not s[id] then
      if not room() then return end
      count = count + 1
      s[id] = {}
    end
    s[id][text] = s[id][text] or kind
  end
  local function gossip()
    local _, id = idOf(UnitGUID("npc"))
    local text =
      tokens(C_GossipInfo and C_GossipInfo.GetText and C_GossipInfo.GetText() or (GetGossipText and GetGossipText()))
    if not id or not text then return end
    local s = shelf("gossip")
    if not s[id] then
      if not room() then return end
      count = count + 1
      s[id] = {}
    end
    s[id][text] = true
  end
  local function loot()
    local seen = {}
    for slot = 1, (GetNumLootItems and GetNumLootItems() or 0) do
      local link = GetLootSlotLink(slot)
      local item = plainText(link) and tonumber(link:match("item:(%d+)"))
      local sources = { GetLootSourceInfo(slot) }
      for i = 1, #sources, 2 do
        local kind, id = idOf(sources[i])
        if kind then
          local key = kind .. ":" .. id
          local s = shelf("loot")
          if not s[key] then
            if not room() then return end
            count = count + 1
            s[key] = { looted = 0, items = {} }
          end
          if not seen[key] then
            seen[key] = true
            s[key].looted = s[key].looted + 1
          end
          if item then s[key].items[item] = (s[key].items[item] or 0) + 1 end
        end
      end
    end
  end

  local function heard(event, ...)
    if event:find("^QUEST_") then
      quest(event)
    elseif event == "PLAYER_TARGET_CHANGED" then
      unit("target")
    elseif event == "UPDATE_MOUSEOVER_UNIT" then
      unit("mouseover")
    elseif event == "GOSSIP_SHOW" then
      gossip()
    elseif event == "LOOT_OPENED" then
      loot()
    else
      local text, _, _, _, _, _, _, _, _, _, _, guid = ...
      said(event:match("CHAT_MSG_MONSTER_(%a+)"):lower(), text, guid)
    end
  end

  function C:start()
    if not C:on() then return end
    -- (the world of Classic Era and of Forever only: not TBC's, nor the
    -- Season of Discovery's, whose quests and creatures are its own)
    local season = C_Seasons and C_Seasons.GetActiveSeason and C_Seasons.GetActiveSeason()
    local discovery = Enum and Enum.SeasonID and Enum.SeasonID.SeasonOfDiscovery or 2
    if not (K.forever or (K.classic and season ~= discovery)) then return end
    if SaltyMaxCollector and SaltyMaxCollector ~= o.saved then return end -- (another of the addons collects)
    SaltyMaxCollector = o.saved
    local t = saved()
    t.game = K.forever and "forever" or "classic"
    local locale = GetLocale()
    t.facts[locale] = t.facts[locale] or {}
    -- Older collectors kept summons as NPCs. Re-observe NPCs with the new
    -- filter, in every saved language, without discarding quests or dialogue.
    for _, byLocale in pairs(t.facts) do
      for id, npc in pairs(byLocale.npc or {}) do
        if npc.world ~= true then byLocale.npc[id] = nil end
      end
    end
    facts = t.facts[locale]
    count = 0
    for _, byLocale in pairs(t.facts) do
      for _, s in pairs(byLocale) do
        for _ in pairs(s) do
          count = count + 1
        end
      end
    end
    me = { ["$N"] = UnitName("player") or "", ["$C"] = UnitClass("player") or "", ["$R"] = UnitRace("player") or "" }
    frame = frame or CreateFrame("Frame")
    for _, e in ipairs({
      "QUEST_DETAIL",
      "QUEST_PROGRESS",
      "QUEST_COMPLETE",
      "PLAYER_TARGET_CHANGED",
      "UPDATE_MOUSEOVER_UNIT",
      "GOSSIP_SHOW",
      "LOOT_OPENED",
      "CHAT_MSG_MONSTER_SAY",
      "CHAT_MSG_MONSTER_YELL",
      "CHAT_MSG_MONSTER_EMOTE",
      "CHAT_MSG_MONSTER_WHISPER",
    }) do
      pcall(frame.RegisterEvent, frame, e)
    end
    frame:SetScript("OnEvent", function(_, event, ...)
      if not C:on() or not facts then return end -- (said no since: nothing more)
      pcall(heard, event, ...)
    end)
  end
  C.tokens = function(_, s) return tokens(s) end -- (for the tests)
  return C
end

-- The opt-in, as a welcome page's choice and a box on the game's Options page
-- (the addon's category).
function K.collectChoice(C)
  return {
    text = L["Share what you see"],
    hint = L["Help the addons keep up with Forever: what the game tells you of quests, creatures and NPCs goes to their shared database. Never your name, your character or your chat. It needs Ravenpost, a small app: %s"]:format(
      RAVENPOST
    ),
    get = function() return C:on() end,
    set = function(v) C:set(v) end,
  }
end
function K.collectSetting(category, variable, C)
  if not (Settings and Settings.RegisterProxySetting and Settings.CreateCheckbox) then return end
  local c = K.collectChoice(C)
  local setting =
    Settings.RegisterProxySetting(category, variable, Settings.VarType.Boolean, c.text, false, c.get, c.set)
  Settings.CreateCheckbox(category, setting, c.hint)
end

-- ── the window ───────────────────────────────────────────────────────────────
-- The standard game window (portrait, title bar), its inset removed, its body
-- dark; art: the portrait's picture, if the addon has one (else the addon
-- sets its own).
-- Nil where the client has no such template.
function K.gameWindow(name, title, art)
  local ok, frame = pcall(CreateFrame, "Frame", name, UIParent, "ButtonFrameTemplate")
  if not ok or not frame then return nil end
  frame.kitName = name
  if ButtonFrameTemplate_HideButtonBar then ButtonFrameTemplate_HideButtonBar(frame) end
  if type(frame.Inset) == "table" then frame.Inset:Hide() end
  -- Its body the dialog box's dark (black at 87%, tiled), not the game's grey
  -- stone (UI-Background-Rock, Bg in both games' template): the user's call,
  -- 18 October 2026. The title bar, the frame and the panels inside as they were.
  if type(frame.Bg) == "table" and frame.Bg.SetTexture then
    frame.Bg:SetTexture("Interface\\DialogFrame\\UI-DialogBox-Background-Dark", "REPEAT", "REPEAT")
  end
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
-- clicked(n) when one is chosen, the tab shown chosen first (K.selectTab: the
-- same from the addon's code, a tab opened by a command).
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
      K.selectTab(window, self:GetID())
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
function K.selectTab(window, n)
  if PanelTemplates_SetTab then PanelTemplates_SetTab(window, n) end
end

-- A window that can be moved, kept on screen, above the game's panels, and
-- closed by Escape (by its name: a window of K.gameWindow or K.dialog); left
-- hidden, as a new frame is shown: its first Show is then a showing (OnShow).
-- place: a saved table to keep where it was left ({ point, x, y }), else the
-- screen's centre each time.
function K.movable(window, width, height, place)
  window:SetSize(width, height)
  if place and place.point then
    window:SetPoint(place.point, UIParent, place.point, place.x or 0, place.y or 0)
  else
    window:SetPoint("CENTER")
  end
  window:SetFrameStrata("HIGH")
  window:SetToplevel(true)
  window:SetMovable(true)
  window:EnableMouse(true)
  window:SetClampedToScreen(true)
  window:RegisterForDrag("LeftButton")
  window:SetScript("OnDragStart", window.StartMoving)
  window:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    if place then
      local point, _, _, x, y = self:GetPoint()
      place.point, place.x, place.y = point, x and math.floor(x + 0.5), y and math.floor(y + 0.5)
    end
  end)
  table.insert(UISpecialFrames, window.kitName)
  window:Hide()
end

-- ── the minimap button ───────────────────────────────────────────────────────
-- The book's button on the minimap: click to open the book, right-click for
-- its settings, drag to move it around the minimap; made of the game's own
-- minimap buttons' textures (the tracking button's border, the zoom
-- highlight). Its place and whether it shows are the addon's settings
-- (get/set: minimapAngle, minimapHidden). Its global name stays
-- <Addon>MinimapButton (Keyring finds the family's buttons by it).
--   M = K.minimapButton({ name = "GoodwillMinimapButton", icon = path, crop = true,
--     title = "Goodwill", lines = function() return { "a white line", ... } end,
--     hint = (the kit's line by default), click = fn, rightClick = fn, get = fn(k), set = fn(k, v) })
--   M:update() after a change of either setting; M.button
-- K.MINIMAP_ANGLES: the family's buttons' places, apart (a button is 31
-- pixels, 25 degrees around the minimap's edge): a new addon takes a free one.
K.MINIMAP_ANGLES = {
  YoursTruly = 115,
  Goodwill = 140,
  Mealbook = 165,
  Hearthtale = 200,
  Yonder = 225,
  SecondWind = 250,
  LorekeepersCodex = 275,
}
function K.minimapButton(o)
  local M = {}
  local button
  local function place()
    local angle = math.rad(o.get("minimapAngle") or 200)
    local r = Minimap:GetWidth() / 2 + 10
    button:ClearAllPoints()
    button:SetPoint("CENTER", Minimap, "CENTER", math.cos(angle) * r, math.sin(angle) * r)
  end
  -- (while dragging: the angle from the minimap's centre to the cursor)
  local function follow()
    local mx, my = Minimap:GetCenter()
    local cx, cy = GetCursorPosition()
    local scale = Minimap:GetEffectiveScale()
    o.set("minimapAngle", math.deg(math.atan2(cy / scale - my, cx / scale - mx)))
    place()
  end
  function M:update()
    if not button then return end
    place()
    button:SetShown(not o.get("minimapHidden"))
  end
  if not Minimap then return M end
  button = CreateFrame("Button", o.name, Minimap)
  M.button = button
  button:SetSize(31, 31)
  button:SetFrameStrata("MEDIUM")
  button:SetFrameLevel(8)
  button:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  button:RegisterForDrag("LeftButton")
  button:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")
  local icon = button:CreateTexture(nil, "BACKGROUND")
  icon:SetTexture(o.icon)
  icon:SetSize(20, 20)
  icon:SetPoint("TOPLEFT", 7, -6)
  if o.crop then icon:SetTexCoord(unpack(K.ICON_CROP)) end
  M.icon = icon
  local edge = button:CreateTexture(nil, "OVERLAY")
  edge:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
  edge:SetSize(53, 53)
  edge:SetPoint("TOPLEFT")
  button:SetScript("OnClick", function(_, mouse)
    if mouse == "RightButton" then
      if o.rightClick then o.rightClick() end
    elseif o.click then
      o.click()
    end
  end)
  button:SetScript("OnDragStart", function(self) self:SetScript("OnUpdate", follow) end)
  button:SetScript("OnDragStop", function(self) self:SetScript("OnUpdate", nil) end)
  button:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:AddLine(o.title)
    for _, line in ipairs(o.lines and o.lines() or {}) do
      GameTooltip:AddLine(line, 1, 1, 1)
    end
    GameTooltip:AddLine(
      o.hint or L["Click to open the book, right-click for the settings. Drag to move this button."],
      0.7,
      0.7,
      0.7,
      true
    )
    GameTooltip:Show()
  end)
  button:SetScript("OnLeave", function() GameTooltip:Hide() end)
  M:update()
  return M
end
-- The minimap button as a welcome page's choice (shown or not).
function K.minimapChoice(get, set)
  return {
    text = L["The book by the minimap"],
    hint = L["Click it to open the book, or drag it around the minimap."],
    get = function() return not get("minimapHidden") end,
    set = function(v) set("minimapHidden", not v) end,
  }
end

-- ── the slash command ────────────────────────────────────────────────────────
-- The addon's slash command, one way for the whole family (the user's call,
-- 24 October 2026): alone it opens the book; an unknown word prints the
-- usage (a typo teaches the commands, never hides them); the replies are
-- sentences, capitalised, after the addon's coloured prefix.
--   K.commands({
--     names = { "/codex", "/lorekeeper" }, key = "LOREKEEPERSCODEX", -- SLASH_<key>n, SlashCmdList[key]
--     name = "Lorekeeper's Codex", prefix = ns.PREFIX, profiles = P (or a function giving it: made later),
--     open = fn,                  -- the command alone
--     usage = its help, the addon's word (help, an unknown word)
--     settings = fn,              -- settings, options: true when a page opened
--     welcome = fn(mode),         -- welcome, export ("export")
--     minimap = { get = fn(k), set = fn(k, v) }, -- minimap: the button shown or hidden, said
--     commands = { [word] = fn(raw), ... }, -- the addon's own (exact words, "reset yes" too)
--     match = fn(msg, raw),       -- anything else of its own; true when handled
--   })
function K.commands(o)
  for i, name in ipairs(o.names) do
    -- (the game reads a slash command's words from these globals)
    -- selene: allow(global_usage)
    _G["SLASH_" .. o.key .. i] = name
  end
  local slash = o.names[1]
  local function say(text) print((o.prefix or "") .. text) end
  local function usage() say(o.usage) end
  SlashCmdList[o.key] = function(msg)
    local raw = strtrim(msg or "") -- (a code's letters as typed)
    msg = raw:lower()
    if msg == "" then
      if o.open then o.open() end
    elseif (msg == "settings" or msg == "options") and o.settings then
      if not o.settings() then say(L["The game's Options have no page for addons here."]) end
    elseif msg == "welcome" and o.welcome then
      o.welcome()
    elseif msg == "export" and o.welcome then
      o.welcome("export")
    elseif msg:match("^import%s") and o.profiles then
      local P = type(o.profiles) == "function" and o.profiles() or o.profiles
      if P and P:import(raw:match("^%a+%s+(.+)$")) then
        say(L["Settings imported for this character."])
      else
        say(L["That isn't a %s settings code (%s export makes one)."]:format(o.name, slash))
      end
    elseif msg == "minimap" and o.minimap then
      local hidden = not o.minimap.get("minimapHidden")
      o.minimap.set("minimapHidden", hidden)
      say(
        hidden and L["Minimap button hidden (%s minimap shows it again)."]:format(slash) or L["Minimap button shown."]
      )
    elseif msg ~= "help" and o.commands and o.commands[msg] then
      o.commands[msg](raw)
    elseif msg == "help" or not (o.match and o.match(msg, raw)) then
      usage()
    end
  end
end

-- ── the Options page ─────────────────────────────────────────────────────────
-- The addon's page in the game's Options (AddOns), where the client has the
-- Settings panel: boxes, a slider, a choice, the opt-in, another character's
-- settings to take; every setting redrawn after a copy or an import.
--   O = K.options({ title = "Lorekeeper's Codex", key = "LOREKEEPERSCODEX",
--     get = ns.option, set = ns.setOption, defaults = DEFAULTS,
--     profiles = P, slash = "/codex", prefix = ns.PREFIX })
--   O:check(key, text, tip, inverted)   (inverted: the box ticked when the setting is false: minimapHidden)
--   O:slider(key, text, tip, min, max, step, label)  (label(value): the value as shown)
--   O:choice(key, text, tip, options, after)  (options(): { { value, text }, ... }; after(value): once chosen)
--   O:collect(C), O:copy(), O:done() (the page registered), O:open() (true when it opened), O.category
function K.options(o)
  local O = { variables = {} }
  local category
  local ok = Settings and Settings.RegisterVerticalLayoutCategory and Settings.RegisterProxySetting
  if ok then
    category = Settings.RegisterVerticalLayoutCategory(o.title)
    O.category = category
  end
  local function variable(key) return ("%s_%s"):format(o.key, key:upper()) end
  local function register(key, kind, text, default, get, set)
    local v = variable(key)
    table.insert(O.variables, v)
    return Settings.RegisterProxySetting(category, v, kind, text, default, get, set)
  end
  function O:check(key, text, tip, inverted)
    if not category then return end
    inverted = inverted and true or false
    local setting = register(
      key,
      Settings.VarType.Boolean,
      text,
      (o.defaults[key] and true or false) ~= inverted,
      function() return (o.get(key) and true or false) ~= inverted end,
      function(value) o.set(key, value ~= inverted) end
    )
    Settings.CreateCheckbox(category, setting, tip)
  end
  function O:slider(key, text, tip, min, max, step, label)
    if not (category and Settings.CreateSliderOptions) then return end
    local setting = register(
      key,
      Settings.VarType.Number,
      text,
      o.defaults[key],
      function() return o.get(key) end,
      function(value) o.set(key, value) end
    )
    local options = Settings.CreateSliderOptions(min, max, step)
    if label and MinimalSliderWithSteppersMixin then
      options:SetLabelFormatter(MinimalSliderWithSteppersMixin.Label.Right, label)
    end
    Settings.CreateSlider(category, setting, options, tip)
  end
  function O:choice(key, text, tip, list, after)
    if not (category and Settings.CreateDropdown and Settings.CreateControlTextContainer) then return end
    local kind = type(o.defaults[key]) == "number" and Settings.VarType.Number or Settings.VarType.String
    local setting = register(key, kind, text, o.defaults[key], function() return o.get(key) end, function(value)
      o.set(key, value)
      if after then after(value) end
    end)
    Settings.CreateDropdown(category, setting, function()
      local c = Settings.CreateControlTextContainer()
      for _, opt in ipairs(list()) do
        c:Add(opt[1], opt[2])
      end
      return c:GetData()
    end, tip)
  end
  function O:collect(C)
    if category then K.collectSetting(category, o.key .. "_SHARE", C) end
  end
  function O:copy()
    if not category then return end
    K.copySetting(
      category,
      o.key .. "_COPYFROM",
      o.profiles,
      L["Another character's choices, for this one (of this game: Classic and Forever keep their own). From elsewhere: %s export there, then %s import CODE here."]:format(
        o.slash,
        o.slash
      ),
      function(other) print((o.prefix or "") .. L["%s's settings copied."]:format(other)) end
    )
  end
  function O:done()
    if category then Settings.RegisterAddOnCategory(category) end
  end
  function O:open()
    if category then Settings.OpenToCategory(category:GetID()) end
    return category ~= nil
  end
  -- (a copy or an import changes them under the page: each one redrawn)
  if o.profiles and o.profiles.onTaken then
    o.profiles:onTaken(function()
      if not (category and Settings.NotifyUpdate) then return end
      for _, v in ipairs(O.variables) do
        pcall(Settings.NotifyUpdate, v)
      end
    end)
  end
  return O
end

-- ── the welcome ──────────────────────────────────────────────────────────────
-- An addon's welcome page, once per character (K.welcomeOnce) or on demand,
-- laid out as the books' windows: on the left its logo and what it is; on the
-- right this character's choices, then another's to take, chosen among this
-- game's characters or brought by a code.
--   W = K.welcome({
--     name = "HearthtaleWelcome", title = "Welcome to Hearthtale",
--     art = an icon for the portrait, logo = a texture (Media/Logo),
--     heading = "Hearthtale", tagline = "...", intro = "...", (or a function
--       giving it, asked when it is built: after the login, the character known)
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
    row.note = note
    row.get, row.kind = c.get, c.options and "select" or "check"
    if c.options then
      name:SetPoint("TOPLEFT", 0, -3)
      name:SetWidth(WELCOME_TEXT - 190)
      note:SetWidth(WELCOME_TEXT - 190)
      row.select = K.select(row, 170, "")
      row.select:SetPoint("TOPRIGHT", 0, 0)
      row.select:SetOptions(c.options)
      row.select.onChange = c.set
    else
      name:SetPoint("TOPLEFT", 28, -3)
      name:SetWidth(WELCOME_TEXT - 30)
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
    -- (a longer line on what it does: the row grows to hold it)
    row:SetHeight(math.max(WELCOME_ROW - 6, 3 + textHeight(name) + 3 + textHeight(note) + 2))
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
    picker.select.placeholder = options[1] and L["Choose a character"] or L["No other character yet"]
    picker.select:SetOptions(options)
    picker.copy:SetEnabled(picker.select:GetValue() ~= nil)
  end
  P:onTaken(function()
    if frame and frame:IsShown() then refresh() end
  end)

  -- Another character of this game, chosen in a select; Copy.
  local function buildPicker(parent, anchor)
    picker = CreateFrame("Frame", nil, parent)
    picker:SetSize(WELCOME_TEXT, 26)
    picker:SetPoint("TOPLEFT", anchor, "BOTTOMLEFT", 0, -10)
    picker.copy = welcomeButton(picker, L["Copy their choices"], 150)
    picker.copy:SetPoint("RIGHT", 0, 0)
    picker.select = K.select(picker, WELCOME_TEXT - 160, L["Choose a character"])
    picker.select:SetPoint("LEFT", 0, 0)
    picker.select.onChange = function() picker.copy:SetEnabled(true) end
    picker.copy:SetScript("OnClick", function()
      local other = picker.select:GetValue()
      if other and P:copy(other) then
        refresh()
        say(L["%s's choices are this character's now."]:format(other), T.accent)
      end
    end)
    return picker
  end

  -- A code: this character's to copy, or one to paste.
  local function buildCode(parent, anchor)
    code = CreateFrame("Frame", nil, parent)
    code:SetSize(WELCOME_TEXT, 54)
    code:SetPoint("TOPLEFT", anchor, "BOTTOMLEFT", 0, -10)
    code.export = welcomeButton(code, L["Give a code"], 120)
    code.export:SetPoint("TOPLEFT", 0, 0)
    code.import = welcomeButton(code, L["Use a code"], 120)
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
        say(L["The code's choices are this character's now."], T.accent)
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
    -- The intro in a scroll of its own: the window grows to hold it, as far as
    -- the screen allows, and what it still can't hold scrolls (a translation
    -- runs longer than the English).
    local scroll = K.scrollArea(left, WELCOME_LEFT - 40, o.name .. "Intro")
    scroll:SetPoint("TOPLEFT", line, "BOTTOMLEFT", 0, -12)
    scroll:SetPoint("BOTTOMRIGHT", left, "BOTTOMRIGHT", -20, 12)
    local intro = K.label(scroll.child, K.BODY_FONT, 12, T.text)
    intro:SetPoint("TOPLEFT", 0, 0)
    intro:SetWidth(WELCOME_LEFT - 40)
    intro:SetSpacing(3)
    intro:SetText(type(o.intro) == "function" and o.intro() or o.intro)
    local textH = textHeight(intro)
    scroll.child:SetHeight(textH + 4)
    -- (the left column: its top, the logo, the heading and tagline, the rule,
    -- the intro, its margins)
    local needed = 58 + 16 + 112 + 8 + textHeight(title) + 4 + textHeight(tagline) + 24 + textH + 12 + 8
    local most = (UIParent and UIParent.GetHeight and UIParent:GetHeight() or 768) - 40
    if needed > frame:GetHeight() then frame:SetHeight(math.min(needed, most)) end
    scroll:UpdateThumb()
    W.intro = scroll -- (for the tests)

    -- Right: this character's choices, and another's.
    local right = K.panel(frame)
    right:SetPoint("TOPLEFT", left, "TOPRIGHT", 4, 32)
    right:SetPoint("BOTTOMRIGHT", -8, 8)
    local who = P:key()
    local last = heading(right, who and L["Choices for %s"]:format(who:match("^(.-) %- ") or who) or L["Your choices"])
    local grown = 0
    for _, c in ipairs(choices) do
      last = choice(right, last, c)
      grown = grown + last:GetHeight() - (WELCOME_ROW - 6)
    end
    -- (the window holds the rows grown for their text, as far as the screen allows)
    local rightNeeded = WELCOME_H + math.max(0, #choices - 3) * WELCOME_ROW + grown
    if rightNeeded > frame:GetHeight() then frame:SetHeight(math.min(rightNeeded, most)) end
    last = heading(right, L["From another character"], last, 14)
    last = buildPicker(right, last)
    last = buildCode(right, last)
    local footnote = K.label(right, K.BODY_FONT, 11, T.soft)
    footnote:SetPoint("TOPLEFT", last, "BOTTOMLEFT", 0, -4)
    footnote:SetWidth(WELCOME_TEXT)
    footnote:SetText(o.footnote)

    local begin = welcomeButton(right, L["Begin"], 110)
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
-- of combat (ready(): the addon has loaded the character, its profile). The
-- family's welcomes take turns (SaltyMaxWelcomes, shared by every copy): a
-- new character with every addon meets them one after another, never seven
-- stacked at once, the next when one is closed.
local function welcomes()
  SaltyMaxWelcomes = SaltyMaxWelcomes or { waiting = {} }
  return SaltyMaxWelcomes
end
function K.welcomeOnce(W, P, ready)
  local events = CreateFrame("Frame")
  local hooked
  local function show()
    if P:get("welcomed") or (ready and not ready()) then return end
    if InCombatLockdown() then return events:RegisterEvent("PLAYER_REGEN_ENABLED") end
    local turn = welcomes()
    if turn.showing and turn.showing ~= W then return table.insert(turn.waiting, show) end
    turn.showing = W
    W:Show()
    if not hooked and W.frame then
      hooked = true
      W.frame:HookScript("OnHide", function()
        if turn.showing ~= W then return end
        turn.showing = nil
        local nextOne = table.remove(turn.waiting, 1)
        if nextOne then C_Timer.After(0.5, nextOne) end
      end)
    end
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
    L["Copy settings from"],
    "",
    function() return "" end,
    function(other)
      if other ~= "" and P:copy(other) and said then said(other) end
    end
  )
  Settings.CreateDropdown(category, copy, function()
    local options = Settings.CreateControlTextContainer()
    options:Add("", L["Choose a character"])
    for _, other in ipairs(P:others()) do
      options:Add(other, other)
    end
    return options:GetData()
  end, tooltip)
end
