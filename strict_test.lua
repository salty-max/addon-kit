-- The strict game's own test (the kit's copy, kit:sync: edit addon-kit's strict_test.lua): each bad call below is
-- a call that raised, or would have, in the player's game, and the strict game must refuse it, naming the argument.
-- If one of these passes, the net has a hole. What the kit asserts here is true of every addon that calls the
-- method (a method its generated table does not list is left out, said at the end). An addon's own cases, the
-- calls it makes that went wrong, go in addon/test/strict_extra.lua, which gets (G, refused, accepted):
--   refused(what, fn, pattern)   fn must raise with pattern in the message and leave one violation
--   accepted(what, fn)           fn must not raise
-- FOREVER=1 for Forever's client.
local G = dofile("addon/test/game.lua")
local S = G.strict
assert(S, "the strict game is on (STRICT=0 turns it off)")
local count, left = 0, {}
local function refused(what, fn, pattern)
  local before = #S.violations
  local ok, err = pcall(fn)
  assert(not ok, "✗ the strict game accepted: " .. what)
  assert(tostring(err):find(pattern, 1, true), ("✗ %s: wrong refusal: %s"):format(what, tostring(err)))
  assert(#S.violations == before + 1, "✗ the refusal was not kept for the check: " .. what)
  S.violations[#S.violations] = nil
  count = count + 1
end
local function accepted(what, fn)
  local ok, err = pcall(fn)
  assert(ok, ("✗ the strict game refused a good call: %s: %s"):format(what, tostring(err)))
  count = count + 1
end
-- (a case on a method this addon's tables do not list is left out: it does not call it)
local function listed(method) return S.api.methods[method] ~= nil or S.evidence[method] ~= nil end
local function when(method, fn)
  if listed(method) then
    fn()
  else
    left[#left + 1] = method
  end
end

local f = CreateFrame("Frame", nil, UIParent)
local t = f:CreateTexture()

when("SetSize", function()
  refused("a size that is text", function() f:SetSize("wide", 20) end, "bad argument #2 (x)")
  accepted("a size", function() f:SetSize(10, 20) end)
end)
when("SetPoint", function()
  refused("a point that is not text", function() f:SetPoint(5) end, "bad argument #2 (point)")
  accepted("the short form of a point", function() f:SetPoint("LEFT", 4, 0) end)
  accepted("a point and nothing else", function() f:SetPoint("TOP") end)
end)
when("SetTexture", function()
  refused("a texture path that is a frame", function() t:SetTexture({}) end, "bad argument")
end)

-- the tooltip: the methods the documentation does not list are held to Blizzard's own call sites
refused("a method that exists in no game", function() GameTooltip:SetNothingAtAll(1) end, "SetNothingAtAll")
when("SetSpellByID", function()
  accepted("a spell tooltip", function() GameTooltip:SetSpellByID(100) end)
end)
-- (an allowlisted method passes, and is said)
S.ALLOW["GameTooltip:SetNothingAtAll"] = "a test"
accepted("an allowlisted method", function() GameTooltip:SetNothingAtAll(1) end)
S.ALLOW["GameTooltip:SetNothingAtAll"] = nil

local extra = io.open("addon/test/strict_extra.lua", "r")
if extra then
  extra:close()
  dofile("addon/test/strict_extra.lua")(G, refused, accepted)
end

-- a refusal inside a pcall is kept all the same
when("SetSize", function()
  S.violations = {}
  pcall(function() f:SetSize("a", "b") end)
  assert(#S.violations == 1, "✗ a pcall hid a refusal")
  S.violations = {}
  count = count + 1
end)
io.write(
  ("✓ strict game: %d refusals and acceptances (%s)%s\n"):format(
    count,
    G.FOREVER and "Forever" or "Classic Era",
    #left > 0 and (", not called here: " .. table.concat(left, ", ")) or ""
  )
)
