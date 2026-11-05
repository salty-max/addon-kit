-- Reads Blizzard's API documentation tables (Blizzard_APIDocumentationGenerated, one pinned
-- source of a game) and writes the part an addon's tests check calls against, as Lua.
--   luajit addon-kit/apidocs-dump.lua <docs dir> <game> <build> <namespaces, comma separated> <out file>
-- (run by addon-kit/apidocs.ts; the documentation files are Lua that call
-- APIDocumentation:AddDocumentationTable, so they are run, not parsed)
local dir, game, build, wanted, out = arg[1], arg[2], arg[3], arg[4], arg[5]
local want = {}
for ns in wanted:gmatch("[^,]+") do
  want[ns] = true
end

-- (the tables name Enum.X.Y and Constants.X in their flags and defaults: any such name is fine here)
local function proxy()
  return setmetatable({}, {
    __index = function(self) return self end,
    __call = function(self) return self end,
    __add = function(self) return self end,
    __sub = function(self) return self end,
    __mul = function(self) return self end,
    __div = function(self) return self end,
  })
end
local tables = {}
local env = setmetatable({
  APIDocumentation = {
    AddDocumentationTable = function(_, t) tables[#tables + 1] = t end,
  },
  Enum = proxy(),
  Constants = proxy(),
}, { __index = _G })

local ls = io.popen('ls "' .. dir .. '"')
local files = {}
for f in ls:lines() do
  if f:find("Documentation%.lua$") then files[#files + 1] = f end
end
ls:close()
table.sort(files)
for _, f in ipairs(files) do
  local chunk = assert(loadfile(dir .. "/" .. f))
  setfenv(chunk, env)
  -- (a file that needs more of the game than the stub has is left out, and said)
  local ok, err = pcall(chunk)
  if not ok then io.stderr:write("skipped " .. f .. ": " .. tostring(err) .. "\n") end
end

local structs, enums = {}, {}
for _, t in ipairs(tables) do
  if t.Type == "Structure" then structs[t.Name] = t end
end
for _, t in ipairs(tables) do
  for _, tt in ipairs(t.Tables or {}) do
    if tt.Type == "Structure" then structs[tt.Name] = tt end
    if tt.Type == "Enumeration" then enums[tt.Name] = true end
  end
end

local function args(list)
  local a = {}
  for i, x in ipairs(list or {}) do
    a[i] = { x.Name, x.Type, x.Nilable == true, x.Default ~= nil, x.ConditionalSecret == true, x.StrideIndex ~= nil }
  end
  return a
end
-- (what the documentation says may come back secret, as a short list of reasons)
local function secrets(f)
  local s = {}
  if f.SecretReturns then s[#s + 1] = "returns" end
  if f.SecretReturnsForAspect then s[#s + 1] = "returns-aspect" end
  if f.SecretWhenUnitIdentityRestricted then s[#s + 1] = "when-unit-identity-restricted" end
  if f.SecretWhenInCombat then s[#s + 1] = "when-in-combat" end
  if f.SecretWhenUnitComparisonRestricted then s[#s + 1] = "when-unit-comparison-restricted" end
  for k in pairs(f) do
    if
      type(k) == "string"
      and k:find("^SecretWhen")
      and k ~= "SecretWhenInCombat"
      and k ~= "SecretWhenUnitIdentityRestricted"
      and k ~= "SecretWhenUnitComparisonRestricted"
    then
      s[#s + 1] = k
    end
  end
  table.sort(s)
  return s
end
local function rets(list)
  local r = {}
  for i, x in ipairs(list or {}) do
    r[i] = { x.Name, x.Type, x.Nilable == true, x.SecretInCombat == true or x.SecretWhenInCombat == true }
  end
  return r
end

local funcs, methods, usedStructs = {}, {}, {}
for _, t in ipairs(tables) do
  if t.Type == "System" and t.Namespace and want[t.Namespace] then
    for _, f in ipairs(t.Functions or {}) do
      funcs[t.Namespace .. "." .. f.Name] = {
        args = args(f.Arguments),
        returns = rets(f.Returns),
        secret = secrets(f),
        sargs = f.SecretArguments,
        nothing = f.MayReturnNothing == true,
      }
    end
  elseif t.Type == "ScriptObject" then
    -- (a widget's methods: the same name on several widgets is several signatures, a call must fit one)
    for _, f in ipairs(t.Functions or {}) do
      if want["m:" .. f.Name] then
        methods[f.Name] = methods[f.Name] or {}
        table.insert(methods[f.Name], { args = args(f.Arguments), secret = secrets(f), widget = t.Name })
      end
    end
  elseif t.Type == "System" and not t.Namespace and t.Name ~= "" then
    for _, f in ipairs(t.Functions or {}) do
      if want[f.Name] then
        funcs[f.Name] = {
          args = args(f.Arguments),
          returns = rets(f.Returns),
          secret = secrets(f),
          sargs = f.SecretArguments,
          nothing = f.MayReturnNothing == true,
        }
      end
    end
  end
end
for _, f in pairs(funcs) do
  for _, a in ipairs(f.args) do
    if structs[a[2]] then usedStructs[a[2]] = true end
  end
end

-- ── writing it (sorted, so a rerun is byte for byte the same)
local function q(s) return ("%q"):format(s) end
local function bool(b) return b and "true" or "false" end
local function argsText(list)
  local p = {}
  for _, a in ipairs(list) do
    p[#p + 1] = ("{%s,%s,%s,%s,%s,%s}"):format(q(a[1]), q(a[2]), bool(a[3]), bool(a[4]), bool(a[5]), bool(a[6]))
  end
  return "{" .. table.concat(p, ",") .. "}"
end
local function listText(list)
  local p = {}
  for _, s in ipairs(list) do
    p[#p + 1] = q(s)
  end
  return "{" .. table.concat(p, ",") .. "}"
end
local function sortedKeys(t)
  local k = {}
  for key in pairs(t) do
    k[#k + 1] = key
  end
  table.sort(k)
  return k
end

local o = {}
o[#o + 1] = "-- GENERATED by addon-kit/apidocs.ts from Blizzard's API documentation, "
  .. game
  .. " build "
  .. build
  .. ". Do not edit."
o[#o + 1] = "-- An argument is { name, type, nilable, hasDefault, conditionalSecret }."
o[#o + 1] = "-- stylua: ignore start"
o[#o + 1] = "return {"
o[#o + 1] = ("  game = %s, build = %s,"):format(q(game), q(build))
o[#o + 1] = "  funcs = {"
for _, k in ipairs(sortedKeys(funcs)) do
  local f = funcs[k]
  o[#o + 1] = ("    [%s] = { args = %s, secret = %s, sargs = %s, nothing = %s },"):format(
    q(k),
    argsText(f.args),
    listText(f.secret),
    f.sargs and q(f.sargs) or "nil",
    bool(f.nothing)
  )
end
o[#o + 1] = "  },"
o[#o + 1] = "  methods = {"
for _, k in ipairs(sortedKeys(methods)) do
  local sigs = {}
  for _, m in ipairs(methods[k]) do
    sigs[#sigs + 1] = ("{ args = %s, widget = %s }"):format(argsText(m.args), q(m.widget))
  end
  o[#o + 1] = ("    [%s] = { %s },"):format(q(k), table.concat(sigs, ", "))
end
o[#o + 1] = "  },"
o[#o + 1] = "  structs = {"
for _, k in ipairs(sortedKeys(usedStructs)) do
  local fields = {}
  for _, fl in ipairs(structs[k].Fields or {}) do
    fields[#fields + 1] = ("{%s,%s,%s,%s}"):format(q(fl.Name), q(fl.Type), bool(fl.Nilable), bool(fl.Default ~= nil))
  end
  o[#o + 1] = ("    [%s] = { %s },"):format(q(k), table.concat(fields, ","))
end
o[#o + 1] = "  },"
o[#o + 1] = "  kinds = {"
local kinds = {}
local function note(list)
  for _, a in ipairs(list) do
    if structs[a[2]] then
      kinds[a[2]] = "struct"
    elseif enums[a[2]] then
      kinds[a[2]] = "enum"
    end
  end
end
for _, f in pairs(funcs) do
  note(f.args)
end
for _, sigs in pairs(methods) do
  for _, m in ipairs(sigs) do
    note(m.args)
  end
end
for _, k in ipairs(sortedKeys(kinds)) do
  o[#o + 1] = ("    [%s] = %s,"):format(q(k), q(kinds[k]))
end
o[#o + 1] = "  },"
o[#o + 1] = "}"
o[#o + 1] = "-- stylua: ignore end"
local fh = assert(io.open(out, "w"))
fh:write(table.concat(o, "\n"), "\n")
fh:close()
