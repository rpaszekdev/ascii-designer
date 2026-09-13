// ai.js — the ✦ tool's plumbing. The model answers in the same ASCII a human pastes, so an answer is just a paste that
// arrives line by line; `drawing` picks the drawn part out of the raw stream and is pure so it can be tested.

// what has been drawn so far: <think> blocks dropped, the inside of the first ``` fence once it has opened (fence lines
// dropped). While streaming only complete lines count, so a half-written box row never flickers into the sheet.
// Without a fence nothing is returned until the stream is done, then the whole answer is the drawing (a plain reply).
export function drawing(text, done = false) {
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  if (t.includes('<think>')) return '';
  const fence = t.match(/```[^\n]*\n/);
  if (fence) {
    t = t.slice(fence.index + fence[0].length);
    const close = t.search(/\n?```/);
    if (close !== -1) { t = t.slice(0, close); done = true; }
  } else if (!done) return '';
  if (!done) t = t.slice(0, t.lastIndexOf('\n') + 1);
  return t.replace(/^\n+/, '').replace(/\s+$/, '');
}

// POST /ai; onText(drawnSoFar, done) fires whenever a new complete line has landed (and once at the end). Resolves to the raw reply.
export async function stream(prompt, context, onText, signal, elements, image) {
  const res = await fetch('/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, context, elements, image }), signal });
  if (!res.ok) throw new Error(await res.text());
  const reader = res.body.getReader(), dec = new TextDecoder();
  let raw = '', last = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (value) raw += dec.decode(value, { stream: true });
    const d = drawing(raw, done);
    if (d !== last || done) { last = d; onText(d, done); }
    if (done) return raw;
  }
}
