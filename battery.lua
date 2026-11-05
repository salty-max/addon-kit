-- The battery's harness for an addon's tests (the kit's copy, kit:sync: edit addon-kit's battery.lua). The test game
-- (wowmock.lua) plus the strict game (strict.lua) plus secret values (secrets.lua) plus this: what every addon's
-- matrix is made of. The matrix itself is the addon's (its windows, its tabs, its states, its events): this holds
-- what any matrix needs, the walk of what is shown, the audits, the hover and click of everything on a page, the
-- failure list and the verdict. addon-kit/docs/battery.md has the whole shape and a template.
--
--   local B = dofile("addon/test/battery.lua")
--   B.track(G)                         in the addon's game.lua, before the addon loads: frames know their children
--                                      and regions, textures their picture, a font string whether it is cut short
--   B.trackTextures(G)                 (a matrix only) textures among a frame's regions too
--   B.shownByDefault()                 (a matrix only) a frame the client makes is shown until something hides it
--   local b = B.new{ G = G, ... }      options below
--   b.try(case, what, fn, ...)         a protected call that records a failure instead of stopping the run
--                                      (TRACE=2000 in the environment keeps that many characters of the traceback)
--   b.audit(case)                      the page as it stands: sizes, places, words, pictures, faults, refusals
--   b.touch(case)                      hover (OnEnter, OnLeave) and click (OnClick, OnMouseUp) everything shown
--   b.finish(verdict)                  the failures by kind to stderr and exit 1, else the verdict line
-- Options of B.new:
--   G            the test game
--   name         the addon's name, for the words of a failure ("Primer kept a fault")
--   roots        function() -> the windows to walk, their frames shown (a list, empty when none is open)
--   screen       { w, h } (default: UIParent)
--   skip         function(frame) -> true for a frame the hover and the click leave alone (a close button)
--   faults       function() -> { what = err } the addon kept, then forget them
--   cut          function() -> the texts the addon's own fit check calls cut short (optional)
--   cutOk        { [text] = why } texts a person judged fine in the game, with why (never a reason to run green)
--   badPicture   function(region) -> true for a texture that should not show (a question mark)
--   rules        { ascii = true, semicolon = true, bang = true, allow = { "\194\183" } }: what a word shown must
--                not hold (the family's prose rules, true by default; false for a language that has accents;
--                allow: signs the interface uses on purpose, a middle dot, taken out before the check)
--   unanchored   function(window) -> true for a window the game places (a banner in the alert stack): its place is not audited
--   kindOf       function(failure) -> the key failures are grouped by in the report (default: the message without its case,
--                digits folded, so one cause in a hundred cases prints once). A secrets run keeps the call in the key
--   printed      the lines the addon printed to chat (default G.state.printed)
--   words        function() -> more words to hold to the rules (printed lines are added)
local B = {}
local rawtype = type

-- ── the test game, made to know what the matrix needs
function B.track(G)
  local createText = G.methods.CreateFontString
  G.methods.CreateFontString = function(self, ...)
    local o = createText(self, ...)
    o.parent = self
    self.regions = self.regions or {}
    table.insert(self.regions, o)
    return o
  end
  local createFrame = CreateFrame
  function CreateFrame(kind, name, parent, template)
    local f = createFrame(kind, name, parent, template)
    if parent then
      parent.kids = parent.kids or {}
      table.insert(parent.kids, f)
    end
    return f
  end
  G.methods.SetDesaturated = function(self, on) self.desat = on and true or false end
  G.methods.GetRegions = function(self) return unpack(self.regions or {}) end
  G.methods.GetChildren = function(self) return unpack(self.kids or {}) end
  G.methods.GetObjectType = function(self) return self.kind end
  G.methods.SetWordWrap = function(self, on) self.nowrap = on == false end
  -- (a text that does not wrap and is wider than its frame is cut short, as the client's IsTruncated tells:
  -- the width is an estimate, 0.55 of the size a character)
  G.methods.IsTruncated = function(self)
    if not self.nowrap or self.w <= 0 then return false end
    local plain = (self.text or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
    return #plain * self.font * 0.55 > self.w
  end
  -- (a texture remembers its picture, so a test can say which)
  G.methods.SetTexture = function(self, path) self.texture = path end
end

-- (a texture is a region of its frame too: the walk sees its picture)
function B.trackTextures(G)
  local createTexture = G.methods.CreateTexture
  G.methods.CreateTexture = function(self, ...)
    local o = createTexture(self, ...)
    o.parent = self
    self.regions = self.regions or {}
    table.insert(self.regions, o)
    return o
  end
end

-- (the mock's frames start hidden, here they start shown: the walk sees a page as the player's game draws it)
function B.shownByDefault()
  local createFrame = CreateFrame
  function CreateFrame(kind, ...)
    local f = createFrame(kind, ...)
    f.shown = true
    return f
  end
end

function B.plain(text)
  return (tostring(text):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""):gsub("|T.-|t", ""):gsub("|n", " "))
end
local plain = B.plain

local FRACTION = { LEFT = 0, RIGHT = 1, TOP = 1, BOTTOM = 0, CENTER = 0.5 }
local function fractions(point)
  local h = point:find("LEFT") and 0 or point:find("RIGHT") and 1 or 0.5
  local v = point:find("TOP") and 1 or point:find("BOTTOM") and 0 or 0.5
  return h, v
end
B.fractions = fractions

function B.new(o)
  local G = o.G
  local b = { hovers = 0, clicks = 0, texts = 0, failures = {}, started = os.clock() }
  local rules = o.rules or {}
  local ascii, semicolon, bang = rules.ascii ~= false, rules.semicolon ~= false, rules.bang ~= false
  local name = o.name or "the addon"
  local screen = o.screen or { w = UIParent.w, h = UIParent.h }
  local cutOk = o.cutOk or {}
  -- (the audit's own question of a window is not the addon's call: the strict game lets that one by, and only it)
  local function scaleOf(root)
    local allow = G.strict and G.strict.ALLOW
    local was = allow and allow["GetScale"]
    if allow then allow["GetScale"] = "the battery's audit of a window" end
    local ok, scale = pcall(root.GetScale, root)
    if allow then allow["GetScale"] = was end
    return ok and rawtype(scale) == "number" and scale or 1 -- (a game of its own may not say)
  end

  local function fail(case, what) b.failures[#b.failures + 1] = case .. ": " .. what end
  b.fail = fail

  function b.try(case, what, fn, ...)
    local ok, err = xpcall(fn, debug.traceback, ...)
    if not ok then fail(case, what .. ": " .. tostring(err):sub(1, tonumber(os.getenv("TRACE") or "") or 300)) end
    return ok
  end

  -- a window's frames, shown ones only (inside a scroll frame a page is as tall as it needs: only what the
  -- screen shows is held to its size)
  function b.shown()
    local out = {}
    local function walk(f, scrolled)
      if not f.shown then return end
      out[#out + 1] = f
      f.scrolled = scrolled
      for _, kid in ipairs(rawtype(f.kids) == "table" and f.kids or {}) do
        walk(kid, scrolled or f.kind == "ScrollFrame")
      end
      local sc = f.scrollChild
      if rawtype(sc) == "table" and sc.parent ~= f then walk(sc, true) end
    end
    for _, root in ipairs(o.roots()) do
      walk(root, false)
    end
    return out
  end

  -- every word on the page and in a tooltip just shown
  function b.words(extra)
    local out = {}
    for _, f in ipairs(b.shown()) do
      if rawtype(f.text) == "string" then out[#out + 1] = f.text end
      if rawtype(f.titleText) == "string" then out[#out + 1] = f.titleText end
      for _, r in ipairs(rawtype(f.regions) == "table" and f.regions or {}) do
        if r.shown and rawtype(r.text) == "string" then out[#out + 1] = r.text end
      end
    end
    for _, line in ipairs(rawtype(GameTooltip.lines) == "table" and GameTooltip.lines or {}) do
      out[#out + 1] = tostring(line)
    end
    for _, line in ipairs(o.printed or (G.state and G.state.printed) or {}) do
      out[#out + 1] = line
    end
    for _, x in ipairs(o.words and o.words() or {}) do
      out[#out + 1] = x
    end
    for _, x in ipairs(extra or {}) do
      out[#out + 1] = x
    end
    return out
  end

  local function rulesOf(case, t, where)
    b.texts = b.texts + 1
    if semicolon and t:find(";") then fail(case, "a semicolon" .. where .. ": " .. t:sub(1, 60)) end
    if bang and t:find("!") then fail(case, "an exclamation mark" .. where .. ": " .. t:sub(1, 60)) end
    for _, sign in ipairs(rules.allow or {}) do
      t = t:gsub((sign:gsub("%p", "%%%0")), "")
    end
    if ascii and t:find("[\128-\255]") then fail(case, "not plain ASCII" .. where .. ": " .. t:sub(1, 60)) end
  end

  -- what the addon kept and the strict game refused, taken and forgotten
  local function kept(case)
    if o.faults then
      local faults = o.faults()
      for what, err in pairs(faults) do
        fail(case, name .. " kept a fault: " .. what .. ": " .. tostring(err):sub(1, 120))
      end
    end
    if G.strict and #G.strict.violations > 0 then
      for _, v in ipairs(G.strict.violations) do
        fail(case, "the strict game refused: " .. v)
      end
      G.strict.violations = {}
    end
  end

  -- a tooltip just shown
  function b.tooltip(case)
    for _, line in ipairs(rawtype(GameTooltip.lines) == "table" and GameTooltip.lines or {}) do
      rulesOf(case, plain(line), " in a tooltip")
    end
    kept(case)
  end

  -- the page as it stands
  function b.audit(case)
    for _, root in ipairs(o.roots()) do
      local scale = scaleOf(root)
      if
        rawtype(root.w) == "number"
        and rawtype(root.h) == "number"
        and (root.w * scale > screen.w or root.h * scale > screen.h)
      then
        fail(case, ("the window is %dx%d on a %dx%d screen"):format(root.w * scale, root.h * scale, screen.w, screen.h))
      end
      local p = root.point
      if
        not (o.unanchored and o.unanchored(root))
        and rawtype(p) == "table"
        and p[2] == UIParent
        and rawtype(p[4]) == "number"
      then
        local ph, pv = fractions(p[1])
        local rh, rv = fractions(p[3] or p[1])
        local x, y = p[4], p[5] or 0
        local left = rh * screen.w + x - ph * root.w * scale
        local bottom = rv * screen.h + y - pv * root.h * scale
        if left < 0 or bottom < 0 or left + root.w * scale > screen.w or bottom + root.h * scale > screen.h then
          fail(case, ("the window is anchored off the screen (left %d, bottom %d)"):format(left, bottom))
        end
      end
    end
    for _, f in ipairs(b.shown()) do
      if rawtype(f.w) == "number" and not f.scrolled and (f.w > screen.w or f.h > screen.h) then
        fail(case, ("a frame is %dx%d, bigger than the screen (%s)"):format(f.w, f.h, f.name or f.kind))
      end
    end
    -- text cut short, where the addon prints a reason
    local cut = o.cut and o.cut() or {}
    for i = #cut, 1, -1 do
      if cutOk[plain(cut[i])] then table.remove(cut, i) end
    end
    if #cut > 0 then
      local where = ""
      for _, f in ipairs(b.shown()) do
        for _, r in ipairs(rawtype(f.regions) == "table" and f.regions or {}) do
          if r.kind == "FontString" and r.shown and r.IsTruncated and r:IsTruncated() then
            where = (" [%d wide, size %d, in %s]"):format(r.w, r.font, f.name or f.kind)
          end
        end
      end
      fail(case, "text cut short: " .. plain(cut[1]):sub(1, 60) .. where)
    end
    -- (a secret value set as text: the client would show it, the family's pages show nothing of it instead)
    for _, f in ipairs(b.shown()) do
      for _, text in ipairs({ f.text, f.titleText }) do
        if rawtype(text) == "userdata" then
          fail(case, "a secret value shown as text in " .. tostring(f.name or f.kind))
        end
      end
      for _, r in ipairs(rawtype(f.regions) == "table" and f.regions or {}) do
        if r.shown and rawtype(r.text) == "userdata" then
          fail(case, "a secret value shown as text in " .. tostring(f.name or f.kind))
        end
      end
    end
    for _, w in ipairs(b.words()) do
      rulesOf(case, plain(w), "")
    end
    if o.badPicture then
      for _, f in ipairs(b.shown()) do
        for _, r in ipairs(rawtype(f.regions) == "table" and f.regions or {}) do
          if r.kind == "Texture" and r.shown and o.badPicture(r) then
            fail(case, "a picture that should not show (" .. tostring(r.texture) .. ")")
            break
          end
        end
      end
    end
    kept(case)
  end

  -- hover and click everything on the page that answers to it
  function b.touch(case)
    local skip = o.skip or function() return false end
    local list = b.shown()
    for _, f in ipairs(list) do
      if not skip(f) then
        for _, script in ipairs({ "OnEnter", "OnLeave" }) do
          local fn = rawtype(f.scripts) == "table" and f.scripts[script]
          if fn then
            b.hovers = b.hovers + 1
            local ok, err = xpcall(fn, debug.traceback, f)
            if not ok then fail(case, ("%s on %s: %s"):format(script, f.name or f.kind, tostring(err):sub(1, 200))) end
            if script == "OnEnter" then b.tooltip(case .. " (tooltip)") end
          end
        end
      end
    end
    for _, f in ipairs(list) do
      if not skip(f) then
        for _, script in ipairs({ "OnClick", "OnMouseUp" }) do
          local fn = rawtype(f.scripts) == "table" and f.scripts[script]
          if fn then
            b.clicks = b.clicks + 1
            local ok, err = xpcall(fn, debug.traceback, f, "LeftButton")
            if not ok then fail(case, ("%s on %s: %s"):format(script, f.name or f.kind, tostring(err):sub(1, 200))) end
          end
        end
      end
    end
    G.advance(0.5)
  end

  -- the end: the first failure of each kind (so one cause is not a thousand lines) and the exit code, or the verdict
  function b.finish(verdict, label)
    label = label or "matrix"
    if #b.failures > 0 then
      local seen, out = {}, {}
      for _, f in ipairs(b.failures) do
        local kind = (o.kindOf or function(x) return x:gsub("^.-: ", ""):gsub("%d+", "#"):sub(1, 70) end)(f)
        if not seen[kind] then
          seen[kind] = 0
          out[#out + 1] = f
        end
        seen[kind] = seen[kind] + 1
      end
      io.stderr:write(("✗ %s: %d failures in %d kinds\n"):format(label, #b.failures, #out))
      for _, f in ipairs(out) do
        io.stderr:write("  ", f, "\n")
      end
      os.exit(1)
    end
    io.write(verdict, "\n")
    os.exit(0)
  end

  return b
end

return B
