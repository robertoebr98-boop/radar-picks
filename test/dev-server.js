// Servidor local mínimo: sirve archivos estáticos y /api/espn (igual que en Vercel).
const http = require('http'), fs = require('fs'), path = require('path');
const handler = require('../api/espn.js');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/espn') {
    const r = { query: Object.fromEntries(u.searchParams) };
    const wrap = { status(c) { res.statusCode = c; return wrap; }, setHeader: (k, v) => res.setHeader(k, v), send: b => res.end(b), json: o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); } };
    return handler(r, wrap);
  }
  const f = path.join(root, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('no'); }
  res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
