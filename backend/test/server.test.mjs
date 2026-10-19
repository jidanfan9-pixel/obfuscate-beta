import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../server.mjs', import.meta.url));
async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('HTTP API exposes health and safely processes source without storing it', async (t) => {
  const port = await freePort();
  const origin = 'https://jidanfan9-pixel.github.io';
  const child = spawn(process.execPath, [serverPath], { env: { ...process.env, PORT: String(port), ALLOWED_ORIGINS: origin }, stdio: 'ignore' });
  t.after(() => { child.kill('SIGTERM'); });

  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) { ready = true; break; }
    } catch { /* Wait for the child process to bind. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'API server should become ready');

  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.deepEqual((await health.json()).ok, true);

  const manifestResponse = await fetch(`http://127.0.0.1:${port}/manus-routes.json`);
  assert.equal(manifestResponse.status, 200);
  assert.deepEqual(await manifestResponse.json(), { routes: [{ path: '/', title: 'Luau Guard' }, { path: '/api-docs.html', title: 'API 文档' }] });

  const docs = await fetch(`http://127.0.0.1:${port}/api-docs.html`);
  assert.equal(docs.status, 200);
  assert.match(await docs.text(), /API REFERENCE/);
  const openApi = await fetch(`http://127.0.0.1:${port}/openapi.yaml`);
  assert.equal(openApi.status, 200);
  assert.match(await openApi.text(), /openapi: 3\.1\.0/);

  const response = await fetch(`http://127.0.0.1:${port}/api/obfuscate`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ source: 'local amount = 2\nprint(amount)', level: 'standard' }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  const result = await response.json();
  assert.ok(result.code.includes('print('));
  assert.ok(!result.code.includes('amount'));
  assert.equal(result.stats.identifiersRenamed, 1);

  const blocked = await fetch(`http://127.0.0.1:${port}/api/obfuscate`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://not-allowed.example' },
    body: JSON.stringify({ source: 'print(1)', level: 'compact' }),
  });
  assert.equal(blocked.status, 403);

  const tooLarge = await fetch(`http://127.0.0.1:${port}/api/obfuscate`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ source: 'x'.repeat(256 * 1024 + 1), level: 'compact' }),
  });
  assert.equal(tooLarge.status, 413);
});
