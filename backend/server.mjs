import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { obfuscate } from './obfuscator.mjs';

const ROOT = resolve(fileURLToPath(new URL('../frontend/', import.meta.url)));
const PORT = Number(process.env.PORT || 3000);
const MAX_SOURCE_BYTES = 256 * 1024;
const MAX_BODY_BYTES = MAX_SOURCE_BYTES + 8192;
const DEFAULT_ORIGINS = ['https://jidanfan9-pixel.github.io', 'http://localhost:3000', 'http://127.0.0.1:3000'];
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(',')).split(',').map((value) => value.trim()).filter(Boolean));
const requestsByClient = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  response.end(JSON.stringify(value));
}
function getOriginError(origin) {
  if (!origin || allowedOrigins.has(origin)) return null;
  try {
    const parsed = new URL(origin);
    if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && parsed.protocol === 'http:') return null;
  } catch { /* Invalid origin is rejected below. */ }
  return '当前站点未获准调用此 API';
}
function applyCors(request, response) {
  const origin = request.headers.origin;
  const error = getOriginError(origin);
  if (error) return error;
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Max-Age', '600');
  return null;
}
function isRateLimited(request) {
  const key = request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = requestsByClient.get(key);
  if (!entry || now - entry.start >= WINDOW_MS) entry = { start: now, count: 0 };
  entry.count++;
  requestsByClient.set(key, entry);
  if (requestsByClient.size > 2048) {
    for (const [client, value] of requestsByClient) if (now - value.start >= WINDOW_MS) requestsByClient.delete(client);
  }
  return entry.count > MAX_PER_WINDOW;
}
async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error('请求体过大'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('请求内容必须是有效 JSON'), { status: 400 }); }
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.yaml': 'application/yaml; charset=utf-8' };

const server = createServer(async (request, response) => {
  const corsError = applyCors(request, response);
  if (corsError) return sendJson(response, 403, { error: corsError });
  if (request.method === 'OPTIONS') { response.writeHead(204); return response.end(); }
  const url = new URL(request.url || '/', 'http://localhost');

  if (url.pathname === '/api/health' && ['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, service: 'luau-guard-api', version: '1.0.0' }));
  }

  if (url.pathname === '/api/obfuscate') {
    if (request.method !== 'POST') return sendJson(response, 405, { error: '此接口只接受 POST 请求' }, { Allow: 'POST, OPTIONS' });
    if (isRateLimited(request)) return sendJson(response, 429, { error: '请求过于频繁，请稍后重试' }, { 'Retry-After': '60' });
    try {
      const body = await readJson(request);
      if (typeof body?.source !== 'string') return sendJson(response, 400, { error: '请提供 source 字符串' });
      if (Buffer.byteLength(body.source, 'utf8') > MAX_SOURCE_BYTES) return sendJson(response, 413, { error: '源码不能超过 256 KiB' });
      if (!body.source.trim()) return sendJson(response, 400, { error: '源码不能为空' });
      const result = obfuscate(body.source, body.level || 'standard');
      return sendJson(response, 200, result);
    } catch (error) {
      return sendJson(response, error.status || 422, { error: error.message || '混淆失败，请检查 Luau 源码' });
    }
  }

  if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'API 路由不存在' });
  if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: '不支持的请求方法' }, { Allow: 'GET, HEAD, OPTIONS' });
  if (url.pathname === '/manus-routes.json') {
    try {
      const manifest = await readFile(resolve(ROOT, '../public/manus-routes.json'));
      response.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      return response.end(request.method === 'HEAD' ? undefined : manifest);
    } catch {
      return sendJson(response, 500, { error: '页面路由清单暂不可用' });
    }
  }
  const isOpenApi = url.pathname === '/openapi.yaml';
  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!isOpenApi && !['index.html', 'app.js', 'styles.css', 'api-config.js', 'favicon.svg', 'api-docs.html'].includes(requested)) return sendJson(response, 404, { error: '页面不存在' });
  try {
    const body = await readFile(isOpenApi ? resolve(ROOT, '../docs/openapi.yaml') : resolve(ROOT, requested));
    response.writeHead(200, { 'Content-Type': MIME[extname(requested)] || 'application/octet-stream', 'Cache-Control': requested.endsWith('.html') || requested === 'api-config.js' ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    return response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    return sendJson(response, 500, { error: '静态资源暂不可用' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Luau Guard API listening on 0.0.0.0:${PORT}`));
