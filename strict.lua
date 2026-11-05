-- The strict game (the kit's, kit:sync copies it beside an addon's test game): the test game's functions and
-- frame methods refuse what Blizzard's API documentation says the client refuses (a missing argument, a string
-- where a number goes), naming the function and the argument.
-- Why: the mock accepts any call, so on Forever GameTooltip:SetTalent(talent, false, false, group) (Era's order)
-- passed Primer's sim and raised "bad argument #3" in the player's game (5 November 2026).
-- An addon's game.lua turns it on after its own world is built and before the addon loads:
--   G.strict = dofile("addon/test/strict.lua"); G.strict.install(G, G.FOREVER and "forever" or "classic")
-- (addon-kit/docs/battery.md has the whole shape)
--
-- What it knows (addon-kit/docs/battery.md has the holes):
--   api_<game>.lua      generated from Blizzard_APIDocumentationGenerated: functions (C_Traits.GetNodeInfo...) and
--                       widget methods (SetPoint, SetTexture...) with argument names, types, nilable, defaults
--   evidence_<game>.lua generated: for a method no documentation lists (GameTooltip:SetTalent...), the argument
--                       counts Blizzard's own Lua calls it with. No call in the game's source: unknown there
--   ALLOW (below)       a method the source never calls and a person has seen work in the game, with the reason
-- A refused call raises AND is kept in S.violations, so a pcall around it cannot hide it from the check.
local S = { violations = {}, unchecked = {}, checked = 0, flagged = {} }
package.loaded["addon-kit.strict"] = S -- (a test can reach it without the game: require("addon-kit.strict"))

-- (reviewed by a person in the game, "GameTooltip:Method" or "Method", with who saw it and when: an addon
-- sets its own entries after the install, in its game.lua)
S.ALLOW = {}

-- The documentation lists only the longest form of a few methods the client takes shorter (SetPoint("TOP")):
-- their arguments from this one on may be left out. Each is a place the net is thinner, listed in addon-kit/docs/battery.md.
S.OPTIONAL_FROM = { SetPoint = 2, SetAllPoints = 1, SetVertexColor = 4, SetBackdropColor = 4, SetTextColor = 4 }

-- Forms the client takes that the documentation does not list (SetPoint("LEFT", 4, 0), the offset form)
S.EXTRA_SIGNATURES = {
  SetTexCoord = {
    {
      args = {
        { "ULx", "number", false, false },
        { "ULy", "number", false, false },
        { "LLx", "number", false, false },
        { "LLy", "number", false, false },
        { "URx", "number", false, false },
        { "URy", "number", false, false },
        { "LRx", "number", false, false },
        { "LRy", "number", false, false },
      },
    },
  },
  SetPoint = {
    {
      args = {
        { "point", "FramePoint", false, false },
        { "offsetX", "uiUnit", false, false },
        { "offsetY", "uiUnit", false, false },
      },
    },
  },
}

-- ── types
local KINDS_STRING = {
  cstring = true,
  string = true,
  stringView = true,
  WOWGUID = true,
  UnitToken = true,
  UnitTokenType = true,
  UnitTokenVariant = true,
  textureAtlas = true,
  textureKit = true,
  -- (the engine's own names, no documentation table: strings by the way Blizzard's Lua passes them, their values not checked)
  FramePoint = true,
  FrameStrata = true,
  DrawLayer = true,
  JustifyHorizontal = true,
  JustifyVertical = true,
  BlendMode = true,
  ClickButton = true,
  MouseButton = true,
  ScriptTypeName = true,
  TBFFlags = true,
  UnitTokenPvPRestrictedForAddOns = true,
}
local KINDS_NAME = {
  FramePoint = true,
  FrameStrata = true,
  DrawLayer = true,
  JustifyHorizontal = true,
  JustifyVertical = true,
  BlendMode = true,
  ClickButton = true,
  MouseButton = true,
  ScriptTypeName = true,
}
local KINDS_FUNCTION = { luaFunction = true, LuaFunctionReference = true, TimerCallback = true }
local KINDS_NUMBER = {
  number = true,
  uiUnit = true,
  uiFontHeight = true,
  SingleColorValue = true,
  time_t = true,
  BigUInteger = true,
  BigInteger = true,
  ClubId = true,
  BagIndex = true,
  fileID = true,
}
local isSecret = function() return false end

-- (nil when the value fits the type, else what was expected)
local function misfit(api, t, v, depth)
  if isSecret(v) then return nil end
  local lt = type(v)
  if t == "luaIndex" then
    if lt ~= "number" or v < 1 or v % 1 ~= 0 then return "a positive whole number (luaIndex)" end
  elseif t == "bool" then
    if lt ~= "boolean" then return "a boolean" end
  elseif t == "fileID" then
    if lt ~= "number" and lt ~= "string" then return "a file id or a path" end
  elseif KINDS_STRING[t] then
    -- (the documented text types take a number too, as the client turns it into text: the engine's names do not)
    if lt ~= "string" and (lt ~= "number" or KINDS_NAME[t]) then return "a string" end
  elseif KINDS_NUMBER[t] then
    if lt ~= "number" then return "a number" end
  elseif t == "table" then
    if lt ~= "table" then return "a table" end
  elseif KINDS_FUNCTION[t] then
    if lt ~= "function" and lt ~= "table" then return "a function" end
  elseif t == "ScriptRegion" then
    if lt ~= "table" and lt ~= "string" then return "a frame or its name" end
  elseif t == "TextureAsset" or t == "SpellIdentifier" then
    if lt ~= "number" and lt ~= "string" then return "a number or a string" end
  elseif api.kinds[t] == "enum" then
    if lt ~= "number" and lt ~= "string" then return "an enum value (" .. t .. ")" end
  elseif api.kinds[t] == "struct" then
    if lt ~= "table" then return "a table (" .. t .. ")" end
    if depth == 0 then
      for _, f in ipairs(api.structs[t] or {}) do
        local fv = v[f[1]]
        if fv == nil then
          if not f[3] and not f[4] then return ("a %s with its field '%s'"):format(t, f[1]) end
        else
          local bad = misfit(api, f[2], fv, 1)
          if bad then return ("a %s whose field '%s' is %s"):format(t, f[1], bad) end
        end
      end
    end
  elseif lt == "table" and t:find("^Simple") then
    return nil
  else
    S.unchecked["type " .. t] = true
  end
  return nil
end

-- (a signature whose last arguments repeat (the documentation's StrideIndex: RegisterForClicks("A", "B")) is
-- laid out to as many arguments as the call gives)
local function expand(args, n)
  local first
  for i, a in ipairs(args) do
    if a[6] then first = first or i end
  end
  if not first or n <= #args then return args end
  local out, stride = {}, #args - first + 1
  for i = 1, n do
    out[i] = i <= #args and args[i] or args[first + (i - first) % stride]
  end
  return out
end

-- (the first thing wrong with a call against one signature, or nil)
local function refuse(api, args, n, ...)
  args = expand(args, n)
  for i, a in ipairs(args) do
    local from = S.OPTIONAL_FROM[S.current or ""]
    if from and i >= from and select(i, ...) == nil then a = { a[1], a[2], true, true, false, false } end
    local v = (select(i, ...))
    if v == nil then
      if not a[3] and not a[4] then return i, a[1], "a value, got nil" end
    else
      local bad = misfit(api, a[2], v, 0)
      if bad then return i, a[1], ("%s, got %s %s"):format(bad, type(v), tostring(v):sub(1, 40)) end
    end
  end
  return nil
end

local function caller()
  for level = 3, 8 do
    local info = debug.getinfo(level, "Sl")
    if
      info
      and info.short_src
      and not info.short_src:find("strict.lua", 1, true)
      and not info.short_src:find("game.lua", 1, true)
    then
      return info.short_src:gsub("^.*/", "") .. ":" .. (info.currentline or 0)
    end
  end
  return "?"
end

local function violate(what)
  local at = caller()
  table.insert(S.violations, what .. " (" .. at .. ")")
  if os.getenv("STRICT") == "soft" then return true end -- (to list every kind of refusal at once)
  error(what, 3)
end

-- ── the wrappers
function S.install(G, game)
  local api = dofile("addon/test/api_" .. game .. ".lua")
  local evidence = dofile("addon/test/evidence_" .. game .. ".lua")
  S.api, S.evidence, S.game = api, evidence, game
  isSecret = issecretvalue or isSecret

  -- (a function of the documentation: `name` as "C_Traits.GetNodeInfo", every argument checked)
  local function wrapFunction(name, fn)
    local doc = api.funcs[name]
    if not doc then
      S.unchecked[name] = true
      return fn
    end
    if #doc.secret > 0 then S.flagged[name] = doc.secret end
    return function(...)
      S.current = nil
      S.checked = S.checked + 1
      local n = select("#", ...)
      local i, arg, why = refuse(api, doc.args, n, ...)
      if i then violate(("bad argument #%d (%s) to '%s': expected %s"):format(i, arg, name, why)) end
      for j = #expand(doc.args, n) + 1, n do
        if (select(j, ...)) ~= nil then
          violate(("too many arguments to '%s': argument #%d, the documentation lists %d"):format(name, j, #doc.args))
        end
      end
      return fn(...)
    end
  end

  -- (a method of a widget: one signature of the several the documentation lists for the name has to fit)
  local function isTooltip(self) return self.name == "GameTooltip" or self.kind == "GameTooltip" end
  local function checkMethod(name, self, ...)
    S.current = name
    local sigs = api.methods[name]
    if sigs then
      S.checked = S.checked + 1
      local n = select("#", ...)
      local firstI, firstArg, firstWhy
      local all = {}
      for _, sig in ipairs(sigs) do
        all[#all + 1] = sig
      end
      for _, sig in ipairs(S.EXTRA_SIGNATURES[name] or {}) do
        all[#all + 1] = sig
      end
      for _, sig in ipairs(all) do
        local i, arg, why = refuse(api, sig.args, n, ...)
        if not i then
          local extra = false
          for j = #expand(sig.args, n) + 1, n do
            if (select(j, ...)) ~= nil then extra = true end
          end
          if not extra then return end
          firstI, firstArg, firstWhy = firstI or (#sig.args + 1), firstArg or "(none)", firstWhy or "no more arguments"
        elseif not firstI then
          firstI, firstArg, firstWhy = i, arg, why
        end
      end
      violate(
        ("bad argument #%d (%s) to '%s:%s': expected %s"):format(
          firstI + 1,
          firstArg,
          self.name or self.kind or "?",
          name,
          firstWhy
        )
      )
      return
    end
    local ev = evidence[name]
    local n = select("#", ...)
    while n > 0 and (select(n, ...)) == nil do
      n = n - 1
    end
    local key = (isTooltip(self) and "GameTooltip:" or "") .. name
    if S.ALLOW[key] or S.ALLOW[name] then return end
    if not ev then
      S.unchecked[name] = true
      if
        violate(
          ("unknown method '%s:%s': no documentation lists it and Blizzard's %s source never names it"):format(
            self.name or self.kind or "?",
            name,
            game
          )
        )
      then
        return
      end
    end
    local seen = isTooltip(self) and ev.tooltip or ev.any
    if #seen == 0 then
      if
        violate(
          ("'%s:%s' has no call in %s's own source (%d call sites of the name on other objects): prove it in the game, then ALLOW it"):format(
            self.name or self.kind or "?",
            name,
            game,
            ev.sites
          )
        )
      then
        return
      end
    end
    for _, c in ipairs(seen) do
      if c == n then return end
    end
    if
      violate(
        ("'%s:%s' called with %d arguments, %s's own source calls it with %s"):format(
          self.name or self.kind or "?",
          name,
          n,
          game,
          table.concat(seen, " or ")
        )
      )
    then
      return
    end
  end

  S.method = function(name, self, ...) return checkMethod(name, self, ...) end

  -- A game of an addon's own (not wowmock.lua: no G.methods) checks its methods itself, through S.method(name,
  -- frame, ...) wherever its frames answer a method call (addon-kit/docs/battery.md, "A game of its own"): only the
  -- documented functions are wrapped here.
  local methods = G.methods
  if not methods then methods = {} end

  -- every method the mock has, and every method it has not (it answers with a no-op, as a lenient mock does)
  for name, fn in pairs(methods) do
    if type(fn) == "function" and (api.methods[name] or evidence[name]) then
      methods[name] = function(self, ...)
        checkMethod(name, self, ...)
        return fn(self, ...)
      end
    end
  end
  if G.methods then
    setmetatable(G.methods, {
      __index = function(_, name)
        if type(name) ~= "string" or not name:match("^%u") then return nil end
        return function(self, ...) checkMethod(name, self, ...) end
      end,
    })
  end
  -- (a tooltip's own methods, set on the object)
  local function wrapTooltip(t)
    for _, name in ipairs({ "SetOwner", "AddLine", "SetItemByID" }) do
      local fn = rawget(t, name)
      if fn then
        t[name] = function(self, ...)
          checkMethod(name, self, ...)
          return fn(self, ...)
        end
      end
    end
  end
  if G.methods then
    wrapTooltip(GameTooltip)
    local create = CreateFrame
    function CreateFrame(kind, ...)
      local f = create(kind, ...)
      if kind == "GameTooltip" then wrapTooltip(f) end
      return f
    end
  end

  -- every documented function the game has: the namespaces' and the globals'
  for name, value in pairs(_G) do
    if type(value) == "table" and name:find("^C_") then
      for fname, fn in pairs(value) do
        if type(fn) == "function" then value[fname] = wrapFunction(name .. "." .. fname, fn) end
      end
    elseif type(value) == "function" and api.funcs[name] then
      _G[name] = wrapFunction(name, value)
    end
  end
end

-- the run's verdict, said once at the end of a sim
function S.report()
  local names = {}
  for k in pairs(S.unchecked) do
    names[#names + 1] = k
  end
  table.sort(names)
  return ("%d calls checked against %s's documentation, %d unchecked: %s"):format(
    S.checked,
    S.game,
    #names,
    table.concat(names, ", ")
  )
end

return S
