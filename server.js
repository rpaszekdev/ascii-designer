// server.js — static files + one streaming route. POST /ai proxies MiniMax so the key never leaves .env; the app is otherwise pure client-side.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), 'public');
const PORT = Number(process.env.PORT) || 3000;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.md': 'text/markdown' };
try { process.loadEnvFile(); } catch {} // .env is optional; without MINIMAX_API_KEY the /ai route says so
const KEY = process.env.MINIMAX_API_KEY;
const MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M3'; // M3 sees screenshots; thinking is switched off so the budget goes to drawing
const RULES = fs.readFileSync(path.join(ROOT, 'PROMPT.md'), 'utf8').replace(/\nSketch:[^\n]*\s*$/, '').trim();
const SYSTEM = `${RULES}

If a screenshot is attached, redraw it as an ASCII wireframe with these idioms: keep its layout, panels, and the texts you can read; about 70 characters wide unless told otherwise.

You are drawing directly onto a canvas that renders these idioms line by line as you write. Answer with ONE \`\`\` code block containing only the ASCII, nothing before or after it. Do not deliberate or verify widths; draw immediately, top to bottom. If the request is a question rather than a drawing, answer inside the code block as short plain lines (max 60 characters each).

When an element list is given and the request is about the EXISTING elements (arrange, align, space, move, resize, rename, delete, wrap, clean up), do not redraw. Answer with ONE \`\`\`json code block holding an array of operations, nothing else, e.g.
[{"op":"row","ids":["a1","b2"],"gap":2},{"op":"align","ids":["a1","b2","c3"],"edge":"left"}]
Operations: move {id,x,y} · resize {id,w,h} · delete {id} · text {id,text} · row {ids,gap} · column {ids,gap} · grid {ids,cols,gap} · align {ids,edge: left|right|top|bottom|centerx|centery} · equalize {ids,prop: w|h} · wrap {ids,title}
Coordinates are canvas cells: x grows right, y grows down, one cell is one character. Use only ids from the list; list ids in reading order; leave elements the user did not mention alone. Only when the request asks for something new or a full redesign answer with a drawing instead.`;

const readBody = (req, limit = 16 * 1024 * 1024) => new Promise((resolve, reject) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > limit) { reject(new Error('body too large')); req.destroy(); } });
  req.on('end', () => resolve(s)); req.on('error', reject);
});

// streams MiniMax's content deltas to the client as plain text; aborts upstream when the client goes away
async function ai(req, res) {
  if (!KEY) return res.writeHead(500, { 'Content-Type': 'text/plain' }).end('MINIMAX_API_KEY missing in .env');
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { return res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`bad request: ${e.message}`); }
  const { prompt, context, elements, image } = body;
  if (typeof prompt !== 'string' || !prompt.trim()) return res.writeHead(400, { 'Content-Type': 'text/plain' }).end('prompt required');
  if (context !== undefined && typeof context !== 'string') return res.writeHead(400, { 'Content-Type': 'text/plain' }).end('context must be text');
  if (elements !== undefined && !Array.isArray(elements)) return res.writeHead(400, { 'Content-Type': 'text/plain' }).end('elements must be a list');
  if (image !== undefined && !(typeof image === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(image))) return res.writeHead(400, { 'Content-Type': 'text/plain' }).end('image must be a png/jpeg/webp/gif data URL');
  const user = elements
    ? [context && `The canvas as ASCII:\n\`\`\`\n${context}\n\`\`\``, `Elements (canvas cells; "selected": true marks what the user selected):\n\`\`\`json\n${JSON.stringify(elements)}\n\`\`\``, `Request: ${prompt}`].filter(Boolean).join('\n\n')
    : context ? `Here is the current drawing:\n\n\`\`\`\n${context}\n\`\`\`\n\n${prompt}\nRedraw it complete, with the change applied.` : prompt;
  const ctrl = new AbortController();
  res.on('close', () => { if (!res.writableFinished) { ctrl.abort(); console.log('ai: client left, upstream aborted'); } });
  let upstream;
  try {
    upstream = await fetch('https://api.minimax.io/v1/chat/completions', {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, stream: true, max_tokens: 6000, temperature: 0.7, thinking: { type: 'disabled' },
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: image ? [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: image } }] : user }] }),
    });
  } catch (e) { return res.writeHead(502, { 'Content-Type': 'text/plain' }).end(`minimax unreachable: ${e.message}`); }
  if (!upstream.ok) return res.writeHead(502, { 'Content-Type': 'text/plain' }).end(`minimax ${upstream.status}: ${(await upstream.text()).slice(0, 300)}`);
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  const dec = new TextDecoder();
  let buf = '';
  try {
    for await (const chunk of upstream.body) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try { const delta = JSON.parse(data).choices?.[0]?.delta?.content; if (delta) res.write(delta); } catch { /* keep-alive or partial frame */ }
      }
    }
  } catch (e) { if (e.name !== 'AbortError') console.error('ai stream:', e.message); }
  res.end();
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (req.method === 'POST' && pathname === '/ai') return ai(req, res).catch((e) => { console.error('ai:', e); if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end(e.message); });
  const file = path.join(ROOT, pathname.replace(/\/$/, '/index.html'));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end('not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  });
}).listen(PORT, () => console.log(`ascii-designer  http://localhost:${PORT}${KEY ? '' : '  (no MINIMAX_API_KEY: ✦ disabled)'}`));
