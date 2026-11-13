-- Draws a kit book as HTML for a look before a build goes to the game, from the
-- kit's real colours and geometry (K.BOOK_W by K.BOOK_H, a list 244 wide and a
-- page beside it, K.SIZES) for the look the run chose (K.paper), with Chrome's
-- fonts in place of the game's: wrapping and a title's width are close, not
-- the game's own, so the game has the last word. Not shipped: an addon's sim
-- calls it when RENDER=dir is set.
--
--   local render = dofile("../addon-kit/render.lua")
--   render(ns.kit, "dir", { scene = "book", title = "Mealbook", tabs = {...}, active = 1,
--     count = "12 of 40", search = "", rows = { { "Section", "section" }, { "Row", "row", picked = true,
--     count = "3/9", bar = 40 }, { "Nothing", "empty" } },
--     page = { heading = "...", sub = "...", blocks = { { "para", "text" }, { "card", "Title", "text" },
--     { "rule" }, { "stats", { 12, "found" }, { 4, "unread" } }, { "bar", 60, "label" } }, ring = true } })
-- writes dir/<scene>_<dark|paper>_<1 to 4>.html for sizes 1 and 4 (a size given as
-- opts.steps); the PNGs are Chrome's:
--   "Google Chrome" --headless --screenshot=x.png --window-size=W,H file://x.html
return function(K, dir, o)
  local T = K.T
  local look = K.paper and "paper" or "dark"
  local DARK = { ground = { 0.05, 0.045, 0.04, 0.9 }, back = { 0.10, 0.09, 0.075 }, edge = { 0.40, 0.33, 0.20 } }
  local ground = K.paper and T.ground or DARK.ground
  local back = K.paper and T.back or DARK.back
  local edge = K.paper and T.edge or DARK.edge
  local function col(c, a)
    return ("rgba(%d,%d,%d,%.2f)"):format(c[1] * 255 + 0.5, c[2] * 255 + 0.5, c[3] * 255 + 0.5, a or c[4] or 1)
  end
  local function esc(s) return (tostring(s):gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;")) end
  -- A string with colour codes, as the game draws it.
  local function coded(s)
    s = esc(s):gsub("|H.-|h(.-)|h", "%1")
    return (
      s:gsub(
        "|cff(%x%x%x%x%x%x)(.-)|r",
        function(hex, text) return ('<span style="color:#%s">%s</span>'):format(hex, text) end
      )
    )
  end
  local W, H = K.BOOK_W, K.BOOK_H
  local font = "font-family:'Trebuchet MS',sans-serif"
  local serif = "Palatino,serif"

  local function row(r)
    local text, kind = r[1], r[2] or "row"
    if kind == "section" then
      return ('<div style="height:24px;line-height:24px;padding-left:4px;font:14px %s;color:%s;white-space:nowrap">%s</div>'):format(
        serif,
        col(T.gold),
        coded(text)
      )
    elseif kind == "empty" then
      return ('<div style="height:18px;line-height:18px;padding-left:8px;font-size:12px;color:%s">%s</div>'):format(
        col(T.soft),
        coded(text)
      )
    elseif r.bar then
      return ('<div style="height:32px;position:relative"><div style="position:absolute;left:18px;top:3px;font:14px %s;color:%s;white-space:nowrap">%s</div><div style="position:absolute;left:18px;right:44px;bottom:4px;height:4px;background:%s"><div style="width:%d%%;height:4px;background:%s"></div></div><div style="position:absolute;right:4px;bottom:0;font-size:10px;color:%s">%s</div></div>'):format(
        serif,
        col(T.gold),
        coded(text),
        col(T.trough),
        r.bar,
        col(T.bar),
        col(T.dim),
        coded(r.count or "")
      )
    end
    return ('<div style="height:18px;line-height:18px;padding-left:18px;font-size:12px;white-space:nowrap;overflow:hidden;color:%s;%s">%s%s</div>'):format(
      col(T.text),
      r.picked and ("background:" .. col(T.highlight, 0.25)) or "",
      coded(text),
      r.count
          and ('<span style="float:right;margin-right:4px;font-size:10px;color:%s">%s</span>'):format(
            col(T.dim),
            coded(r.count)
          )
        or ""
    )
  end

  local function blocks(list)
    local out = {}
    for _, b in ipairs(list or {}) do
      local kind = b[1]
      if kind == "para" then
        table.insert(
          out,
          ('<div style="font-size:13px;line-height:1.45;color:%s;margin-bottom:10px">%s</div>'):format(
            col(b.colour or T.text),
            coded(b[2])
          )
        )
      elseif kind == "rule" then
        table.insert(out, ('<div style="height:1px;background:%s;margin:8px 0"></div>'):format(col(T.rule)))
      elseif kind == "heading" then
        table.insert(
          out,
          ('<div style="font:16px %s;color:%s;margin:8px 0 4px">%s</div>'):format(serif, col(T.gold), coded(b[2]))
        )
      elseif kind == "card" then
        table.insert(
          out,
          ('<div style="background:%s;border:1px solid %s;box-sizing:border-box;padding:6px 10px;margin-bottom:8px"><div style="font-size:13px;color:%s">%s</div><div style="font-size:11px;color:%s;margin-top:2px">%s</div></div>'):format(
            col(T.field),
            col(edge),
            col(T.text),
            coded(b[2]),
            col(T.soft),
            coded(b[3] or "")
          )
        )
      elseif kind == "bar" then
        table.insert(
          out,
          ('<div style="margin:6px 0"><div style="font-size:11px;color:%s;margin-bottom:2px">%s</div><div style="height:6px;background:%s"><div style="width:%d%%;height:6px;background:%s"></div></div></div>'):format(
            col(T.soft),
            coded(b[3] or ""),
            col(T.trough),
            b[2],
            col(T.bar)
          )
        )
      elseif kind == "stats" then
        local cells = {}
        for i = 2, #b do
          table.insert(
            cells,
            ('<div style="width:100px;height:60px;background:%s;border:1px solid %s;box-sizing:border-box;text-align:center"><div style="font:22px %s;color:%s;margin-top:6px">%s</div><div style="font-size:11px;color:%s">%s</div></div>'):format(
              col(T.field),
              col(edge),
              serif,
              col(T.gold),
              esc(b[i][1]),
              col(T.soft),
              esc(b[i][2])
            )
          )
        end
        table.insert(out, '<div style="display:flex;gap:10px;margin:8px 0">' .. table.concat(cells) .. "</div>")
      elseif kind == "raw" then
        table.insert(out, b[2])
      end
    end
    return table.concat(out)
  end

  local function page(p)
    local head = ('<div style="width:64px;height:64px;border-radius:50%%;border:3px solid %s;position:absolute;left:2px;top:2px;box-sizing:border-box;background:%s"></div>'):format(
      col(T.ring),
      col(T.wash, 0.5)
    )
    return head
      .. ('<div style="position:absolute;left:86px;top:10px;font:24px %s;color:%s;white-space:nowrap">%s</div><div style="position:absolute;left:86px;top:41px;font-size:12px;color:%s">%s</div><div style="position:absolute;left:0;right:0;top:76px;height:1px;background:%s"></div><div style="position:absolute;left:0;right:0;top:88px;bottom:0;overflow:hidden">%s</div>'):format(
        serif,
        col(p.headColour or T.gold),
        coded(p.heading or ""),
        col(T.soft),
        coded(p.sub or ""),
        col(T.rule),
        blocks(p.blocks)
      )
  end

  local function tabs()
    local out = {}
    for i, t in ipairs(o.tabs or {}) do
      table.insert(
        out,
        ('<div style="padding:3px 12px;font-size:12px;color:%s;background:%s;border:1px solid %s;border-top:none">%s</div>'):format(
          col(i == (o.active or 1) and T.gold or T.soft),
          col(i == (o.active or 1) and ground or back),
          col(edge),
          esc(t)
        )
      )
    end
    return '<div style="position:absolute;left:12px;bottom:-24px;display:flex;gap:4px">'
      .. table.concat(out)
      .. "</div>"
  end

  local function html()
    local rows = {}
    for _, r in ipairs(o.rows or {}) do
      table.insert(rows, row(r))
    end
    local inner = ('<div style="position:absolute;left:0;right:0;top:0;height:28px;background:%s"></div><div style="position:absolute;left:10px;top:6px;font:16px %s;color:%s">%s</div><div style="position:absolute;left:262px;top:36px;font-size:11px;color:%s">%s</div><div style="position:absolute;left:15px;top:30px;width:225px;height:22px;background:%s;border:0;box-sizing:border-box;font-size:12px;line-height:20px;padding-left:27px;color:%s"><div style="position:absolute;left:11px;top:5px;width:6px;height:6px;border:1.5px solid %s;border-radius:50%%"></div>%s</div>'):format(
      col(K.paper and edge or { 0.12, 0.10, 0.08 }),
      serif,
      K.paper and "#f3e6c0" or "#e8d9a8",
      esc(o.title or ""),
      col(T.soft),
      esc(o.count or ""),
      col(T.field),
      col(T.text),
      col(T.soft),
      esc(o.search or "")
    )
    inner = inner
      .. ('<div style="position:absolute;left:8px;top:58px;width:244px;bottom:8px;background:%s;border:1px solid %s;box-sizing:border-box;overflow:hidden"><div style="margin:10px 12px 0 12px">%s</div></div>'):format(
        col(ground),
        col(edge),
        table.concat(rows)
      )
      .. ('<div style="position:absolute;left:260px;top:58px;right:8px;bottom:8px;background:%s;border:1px solid %s;box-sizing:border-box;overflow:hidden"><div style="position:absolute;left:26px;top:22px;right:26px;bottom:14px">%s</div></div>'):format(
        col(ground),
        col(edge),
        page(o.page or {})
      )
    if o.select then
      -- (the kit's own select, open: its face, its list, the picked row washed)
      -- (dark on paper too: the same face, text, arrow and menu as the dark look's)
      local D = K.paper
          and {
            field = { 0.05, 0.04, 0.03, 0.95 },
            menu = { 0.05, 0.04, 0.03, 0.97 },
            text = { 0.93, 0.88, 0.76 },
            ring = { 0.72, 0.56, 0.24 },
            accent = { 0.85, 0.70, 0.42 },
            highlight = { 1, 1, 1 },
          }
        or T
      local sel, items = o.select, {}
      for i, text in ipairs(sel.options) do
        table.insert(
          items,
          ('<div style="height:22px;line-height:22px;padding-left:6px;font-size:12px;color:%s;%s">%s</div>'):format(
            col(D.text),
            i == sel.picked and ("background:" .. col(D.highlight, 0.28)) or "",
            esc(text)
          )
        )
      end
      inner = inner
        .. ('<div style="position:absolute;left:20px;top:64px;width:220px;height:24px;background:%s;border:1px solid %s;box-sizing:border-box;line-height:22px;padding-left:8px;font-size:12px;color:%s">%s<span style="position:absolute;right:8px;top:0;color:%s">&#9662;</span></div><div style="position:absolute;left:20px;top:90px;width:220px;background:%s;border:1px solid %s;box-sizing:border-box;padding:4px 10px 4px 4px">%s</div>'):format(
          col(D.field),
          col(D.ring, 0.7),
          col(D.text),
          esc(sel.options[sel.picked] or ""),
          col(D.accent),
          col(D.menu),
          col(D.ring, 0.9),
          table.concat(items)
        )
    end
    return ('<body style="margin:0;background:%s;%s"><div style="width:%dpx;height:%dpx;position:relative;background:%s;border:2px solid %s;box-sizing:border-box;overflow:visible">%s%s</div></body>'):format(
      K.paper and "#2a3a2a" or "#101010",
      font,
      W,
      H,
      col(back),
      col(edge),
      inner,
      tabs()
    )
  end

  for _, step in ipairs(o.steps or { 1, 4 }) do
    local scale = K.scaleFor(step, W, H)
    local h = html():gsub('<body style="', ('<body style="zoom:%s;'):format(scale), 1)
    local f = assert(io.open(("%s/%s_%s_%d.html"):format(dir, o.scene or "book", look, step), "w"))
    f:write(h)
    f:close()
  end
end
