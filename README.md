# ascii designer

A white canvas. Paste ASCII, get components.

```
npm start            # → http://localhost:3000   (PORT=3737 node server.js if 3000 is taken)
npm test
```

Copy any ASCII wireframe — from Claude, a README, Slack, your own terminal — and hit **⌘V** on the canvas.
The reader finds rectangles (including regions carved by `├ ┬ ┤ ┴` junctions, and boxes whose sides wobble
a column or two) plus a dozen idioms, and turns them into a tree of components placed exactly where the
characters were (1 cell = 8 × 18 px). Anything it doesn't recognise stays as grey text, so nothing is lost.

From then on the **tree is the truth, ASCII is import/export**: drag any component (its children follow),
resize it with the corner handle, delete it — then ⌘C prints fresh ASCII from the tree, with proper
junctions where boxes touch. Double-click a sheet to edit it as ASCII and re-import.

| ASCII | becomes |
|---|---|
| `┌───┐ │ └───┘` or `+---+ \| +---+` | frame (outermost) / box (nested); `┌─ Title ─┐` keeps the title. Roles from geometry: page, mobile, nav, footer, sidebar, main, panel, card, tile |
| a box full of `╲ ╱` diagonals | image |
| `[ Sign up ]` | button |
| `[email_______]` | input with placeholder |
| `[ Photo ▾ ]` | select |
| `[x]` `[ ]` `(o)` `( )` | checkbox / radio |
| `< Watch demo >` | link |
| `# ## ###` | headings |
| `──►` `-->` `<──` `→` | arrows (drawn arrows print in any direction: `─ │ ╲ ╱` with `► ◄ ▲ ▼` heads) |
| drawn circles | print as `╭──╮ ╱ ╲ ╰──╯` ellipses |
| `─────` `-----` `=====` | divider |
| `~~~~~~` `[ img ]` | image placeholder |
| `[:bell:]`, or a box holding only `:rocket:` | icon (Lucide); the box is the icon's size |
| everything else | text — or grey "unknown" if it's mostly symbols |

Canvas: scroll = pan · ⌘+scroll = zoom · space+drag = pan · click = select (innermost component; the frame selects
the sheet) · drag = move (components in cells, sheets on the canvas) · corner handle = resize · ⌫ = delete ·
⌘C = print the selection as ASCII · double-click = edit the sheet as ASCII and re-import.
⌘⇧C = copy the reader's JSON for the selected sheet (frames, roles, items in cells — the hook for a classifier or Claude).
⌘⇧P = copy `public/PROMPT.md`, the prompt that makes Claude draw ASCII this reader understands.
Bottom bars (Excalidraw's layout, fewer buttons; icons are Lucide): **tools** in the centre, numbered like Excalidraw — 🔓 keep tool (Q) · hand (H) pans ·
1 pen (freehand; prints as `─ │ ╱ ╲` segments) · 2 select · 3 rectangle · 4 diamond · 5 ellipse · 6 arrow · 7 line · 8 text (click and type) ·
9 eraser (click an item); the letters V R D O A L T E P still work —
drag on the canvas to draw; a shape drawn inside a sheet joins it (snapped to its cells), elsewhere it starts a new sheet; Esc returns to select.
**Selection**: click an item, ⇧-click to add, or drag a marquee on empty canvas (a sheet swallowed whole is picked as one); drag moves
the whole selection, the corner handle scales it as a group in cells (children follow their boxes, text keeps its width), ⌫ deletes it,
⌘C prints it as one ASCII drawing. **Zoom** bottom-left (−/+, click % for 100%, fit). **Skins** bottom-right: wire / sketch / hi-fi
(sketch is the default) · **air** toggles negative space: every border gets its own line with a cell of space between, so
sketchy strokes never cross; the tree stays tight, so ⌘C and the model still get the compact ASCII · **select all** (⌘A) picks every sheet · **ascii** renders the whole canvas (every sheet at its canvas
position) back to one ASCII drawing, shows it, and copies it. Sheets persist in localStorage.

**ask (⌘K)**, bottom-right, is the edit side of the AI: select things (or nothing, for the whole canvas), say what should
change — "put these in a row", "2×2 grid", "align left", "rename the button", "clean it up" — and the model answers with a
short list of operations over element ids (row, column, grid, align, equalize, wrap, move, resize, delete, text) that
`ops.js` applies exactly; it gets the ASCII plus every element's id and position, so it knows what is where. A drawing
answer instead replaces what you selected. Either way it is one undo step: **⌘Z / ⌘⇧Z** undo and redo everything.

**Screenshots**: ⌘V an image anywhere (or into an open ✦ bubble) and the ✦ opens with it attached; Enter redraws it as an
ASCII wireframe → components (or say what you want from it). Needs a model that sees images: `MiniMax-M3` (the default, also set as `MINIMAX_MODEL` in `.env`;
thinking is switched off in the request, otherwise MiniMax spends its whole budget reasoning about the picture).

**✦ AI (K)** is the last tool: click anywhere on the canvas, say what should appear there, and the model draws it — in the same
ASCII you would paste — streamed into a sheet at that spot and re-read as every line lands, so components appear while it writes.
With a selection, the selection's ASCII goes along as context and the answer is the redrawn version. Put `MINIMAX_API_KEY=…` in
`.env` (optional `MINIMAX_MODEL`, default `MiniMax-M2.5`); `server.js` proxies `POST /ai` so the key stays on the server.

No build, no dependencies: `public/` is the whole app; `reader.js` (ASCII → tree) and `printer.js` (tree → ASCII) are the interesting files.
