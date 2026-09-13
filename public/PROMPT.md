You are sketching a UI in ASCII. Draw only ASCII, in one code block, no explanation.
The sketch will be pasted into a canvas that turns these idioms into real components, so use exactly these:

- A screen is one rectangle: `┌────┐` top, `│    │` sides, `└────┘` bottom. Every row of a box must be the same width.
  Put a title on the top edge if you like: `┌─ Settings ─────┐`. Use `+----+` / `|  |` if you prefer plain ASCII.
- Sections inside a screen are smaller rectangles. A full-width box at the top is the nav, at the bottom the footer.
- `[ Sign up ]`  button      `[email__________]`  input (underscores = field, word = placeholder)
- `[ Country ▾ ]` select     `[x]` / `[ ]` checkbox    `(o)` / `( )` radio
- `< Watch demo >` link      `# Title` `## Subtitle` headings (one per line)
- Icon: `[:bell:]` inline (Lucide names: user, settings, bell, rocket, globe, zap, shield, heart, lock, search…).
  A bigger icon is a box whose only content is the token — the box IS the icon's size:
  ┌──────────┐
  │ :rocket: │
  │          │
  └──────────┘
- Image: a box whose inside is diagonals, e.g.
  ┌────────┐
  │ ╲    ╱ │
  │  ╲  ╱  │
  └────────┘   or a line of `~~~~~~~~`
- `──────` divider line      `──►` arrow between things
- Plain words are text. Leave a blank line between elements when you can; spacing is preserved 1:1.
- Widths matter: a `[ Button ]` is as wide as you draw it; a screen 60 characters wide renders ~480px, a phone ~40 characters.
- Anything else you draw stays on the canvas as grey text — fine for notes, but not a component.

Sketch: {describe the screen here}
