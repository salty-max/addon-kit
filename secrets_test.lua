-- The secret values' own test: what the family's emulation refuses, and what it lets through. FOREVER=1 is not needed.
local X = dofile("secrets.lua")
assert(X == dofile("secrets.lua"), "one instance, however many dofile it")
local G = { FOREVER = true }
local store = {}
assert(X.install(G, store) == X)
assert(X.install({ FOREVER = false }, {}) == nil, "Era has no secret values")

local v = X.secret("string")
assert(issecretvalue(v) and not issecretvalue("x") and not issecretvalue(nil))
local function raises(what, fn) assert(not pcall(fn), "a secret value let through: " .. what) end
raises("index", function() return v.x end)
raises("length", function() return #v end)
raises("concat", function() return v .. "a" end)
raises("arithmetic", function() return v + 1 end)
raises("order", function() return v < 1 end)
raises("call", function() return v() end)
raises("pairs", function()
  for _ in pairs(v) do
  end
end)
raises("ipairs", function()
  for _ in ipairs(v) do
  end
end)

-- type() reports the type a secret stands for, once patched
local rawtype = type
X.patchType()
assert(type(v) == "string" and type(X.secret("number")) == "number" and type({}) == "table")
type = rawtype

-- whole: one secret. fields: a table comes back plain, every value inside it secret
assert(issecretvalue(X.secretize({ a = 1 }, true)))
local fields = X.secretize({ a = 1, b = { c = "x" } }, false)
assert(
  rawtype(fields) == "table" and issecretvalue(fields.a) and rawtype(fields.b) == "table" and issecretvalue(fields.b.c)
)
assert(X.secretize(nil, true) == nil)
assert(X.secretize(v, true) == v, "a secret stays the one it is")

-- drive: every call of a C_ namespace answers with secrets in turn, and is put back
C_Test = { One = function() return 1, "two" end, Two = function() return { 3 } end }
C_Timer = { After = function() end }
function Plain() return 5 end
local seen = {}
local done = X.drive(G, {
  globals = { "Plain", "Missing" },
  each = function(label, name, whole)
    seen[#seen + 1] = label
    local a, b = (C_Test.One or Plain)()
    if name == "C_Test.One" or name == "Plain" then
      assert(issecretvalue(a) or name == "Plain" and issecretvalue(Plain()))
    end
  end,
})
assert(done.targets == 3 and #seen == 6, #seen)
assert(C_Test.One() == 1 and Plain() == 5, "put back")
print("✓ secrets: refused, patched, driven")
