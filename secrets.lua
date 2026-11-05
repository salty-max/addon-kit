-- Secret values for an addon's tests (the kit's copy, kit:sync: edit addon-kit's secrets.lua). Forever hides
-- some of the game's answers from addons (issecretvalue, SecretReturns and SecretWhen* in Blizzard's
-- documentation): a secret value keeps its type for type() and raises on indexing, #, pairs, ipairs,
-- arithmetic, concatenation, ordering and calling. (== against one and using it as a table key do not raise.)
-- How the client really hides a value is for the game to say, this is the emulation the family tests with.
--
--   local X = dofile("addon/test/secrets.lua")
--   X.install(G, store)   in the test game on Forever, before the addon loads (Kit.lua reads issecretvalue at
--                         load): issecretvalue(v) is true for every v with store[v] == true. nil on Era
--   X.patchType()         type() reports the type a secret stands for (call it before the addon loads, as an
--                         addon keeps a copy of the globals it uses)
--   X.secret(kind)        a secret value that stands for a "string", "number", "table"...
--   X.secretize(v, whole) whole: v as one secret; else a table comes back plain, every value inside it secret
--   X.drive(G, opts)      each call of the game answers with secrets, one call at a time, whole and then field
--                         by field; opts.each(label, name, whole) plays the addon while it does (see below)
-- (one instance per run, however many files dofile it: the test game installs it, the matrix uses it)
if package.loaded["addon-kit.secrets"] then return package.loaded["addon-kit.secrets"] end
local X = {}
package.loaded["addon-kit.secrets"] = X
local rawtype = type
local kinds = setmetatable({}, { __mode = "k" })
local store

local boom = {}
for _, m in ipairs({
  "__index",
  "__newindex",
  "__len",
  "__call",
  "__concat",
  "__add",
  "__sub",
  "__mul",
  "__div",
  "__mod",
  "__pow",
  "__unm",
  "__lt",
  "__le",
  "__tostring",
}) do
  boom[m] = function() error("attempt to use a secret value", 2) end
end

function X.install(G, known)
  if not G.FOREVER then return nil end
  store = known or {}
  function issecretvalue(v) return store[v] == true end
  return X
end

function X.patchType()
  function type(v) return kinds[v] or rawtype(v) end
end

function X.secret(kind)
  -- (a userdata: LuaJIT ignores __len on a table and pairs and ipairs read it raw, so only this raises on all of them)
  local v = newproxy(true)
  local mt = getmetatable(v)
  for k, f in pairs(boom) do
    mt[k] = f
  end
  kinds[v] = kind
  if store then store[v] = true end
  return v
end

function X.secretize(v, whole)
  local t = rawtype(v)
  if v == nil then return nil end
  if t == "table" and not kinds[v] then -- (a secret is a userdata, never a table here)
    if whole then return X.secret("table") end
    local out = {}
    for k, x in pairs(v) do
      out[k] = X.secretize(x, false)
    end
    return out
  end
  return kinds[v] and v or X.secret(t)
end

local function pack(...) return { n = select("#", ...), ... } end
function X.wrap(fn, whole)
  return function(...)
    local r = pack(fn(...))
    for i = 1, r.n do
      r[i] = X.secretize(r[i], whole)
    end
    return unpack(r, 1, r.n)
  end
end

-- Every call of the game the addon can make: the functions of the C_* namespaces (not C_Timer, which is the
-- test game's clock) and opts.globals (UnitName, GetNumTalents...), sorted by name.
function X.targets(opts)
  local targets, skip = {}, opts.skip or {}
  for name, value in pairs(_G) do
    if rawtype(value) == "table" and name:find("^C_") and name ~= "C_Timer" and not skip[name] then
      for fname, fn in pairs(value) do
        if rawtype(fn) == "function" then targets[#targets + 1] = { name .. "." .. fname, value, fname } end
      end
    end
  end
  for _, name in ipairs(opts.globals or {}) do
    if rawtype(_G[name]) == "function" then targets[#targets + 1] = { name, _G, name } end
  end
  table.sort(targets, function(a, b) return a[1] < b[1] end)
  return targets
end

-- opts.globals   the global functions to hide too, by name
-- opts.skip      { C_Namespace = true } left alone
-- opts.original  function(name, fn) -> a function to wrap instead of fn (for a call the test plays through
--                itself, like UnitClass answering as the character being played), or nil
-- opts.each      function(label, name, whole) called with the call replaced, to play the addon (open its
--                windows, log in, read what it reads) and record failures; label says which call and how
-- Returns { targets = n, flagged = n }: the calls hidden, and how many of them the documentation itself flags as
-- secret (strict.lua). Counting what each() played is the caller's.
function X.drive(G, opts)
  if not G.FOREVER then
    io.write("✓ secrets: Classic Era has no secret values, nothing to run\n")
    return { targets = 0, flagged = 0, skipped = true }
  end
  local targets = X.targets(opts)
  for _, target in ipairs(targets) do
    local name, tbl, key = target[1], target[2], target[3]
    local real = tbl[key]
    local original = opts.original and opts.original(name, real) or real
    for _, whole in ipairs({ true, false }) do
      tbl[key] = X.wrap(original, whole)
      opts.each(("%s answering %s"):format(name, whole and "secret" or "with secret fields"), name, whole)
    end
    tbl[key] = real
  end
  local n = 0
  for _ in pairs(G.strict and G.strict.flagged or {}) do
    n = n + 1
  end
  return { targets = #targets, flagged = n }
end

return X
