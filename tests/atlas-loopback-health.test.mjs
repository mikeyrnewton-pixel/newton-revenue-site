import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { checkActivepiecesLocalHealth } from '../lib/atlas-loopback-health.mjs';

async function withLoopbackServer(handler, testFn) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try { await testFn(server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('health probe GETs only the documented Activepieces localhost endpoint', async () => {
  const requests = [];
  await withLoopbackServer((req, res) => {
    requests.push({ method:req.method, path:req.url, host:req.headers.host });
    res.writeHead(200, { 'Content-Type':'application/json' });
    res.end(JSON.stringify({secret:'DO_NOT_LEAK_20491'}));
  }, async port => {
    const state = await checkActivepiecesLocalHealth({port, timeoutMs:1000});
    assert.equal(state, 'HEALTH_HTTP_2XX_APP_ID_AND_WORKERS_UNVERIFIED');
    assert.deepEqual(requests, [{method:'GET',path:'/api/v1/health',host:'127.0.0.1:'+port}]);
    assert.ok(!state.includes('DO_NOT_LEAK'));
  });
});

test('nonhealthy and redirect responses never produce a verified result or follow URLs', async () => {
  let hits=0;
  await withLoopbackServer((req,res) => {
    hits++;
    res.writeHead(302, {Location:'https://example.org/private'});
    res.end();
  }, async port => {
    assert.equal(await checkActivepiecesLocalHealth({port}), 'HEALTH_HTTP_NON_2XX');
    assert.equal(hits,1);
  });
  await withLoopbackServer((req,res) => {
    res.writeHead(503);
    res.end('private diagnostic details');
  }, async port => assert.equal(await checkActivepiecesLocalHealth({port}), 'HEALTH_HTTP_NON_2XX'));
});

test('only valid local numeric ports are accepted', async () => {
  assert.equal(await checkActivepiecesLocalHealth({port:0}), 'INVALID_LOCAL_PORT');
  assert.equal(await checkActivepiecesLocalHealth({port:70000}), 'INVALID_LOCAL_PORT');
  assert.equal(await checkActivepiecesLocalHealth({port:'https://example.org'}), 'INVALID_LOCAL_PORT');
});
