import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer, makeCache} from '../server/index.mjs';
async function serve(fn) {const app=createAppServer({apiKey:''});await new Promise(r=>app.listen(0,'127.0.0.1',r));try{return await fn(`http://127.0.0.1:${app.address().port}`);}finally{await new Promise(r=>app.close(r));}}
test('health, config, demo search, CSP and file serving',()=>serve(async url=>{
  const h=await fetch(url+'/healthz');assert.equal(h.status,200);
  const c=await (await fetch(url+'/api/config')).json();assert.equal(c.mode,'demo');
  const r=await fetch(url+'/api/search?location=London&category=beauty&radius=10');assert.equal(r.status,200);
  assert.ok(r.headers.get('content-security-policy').includes('script-src'));
  const d=await r.json();assert.ok(d.salons.length);assert.ok(d.salons.every(s=>s.demo));
  const page=await fetch(url+'/');assert.equal(page.status,200);assert.ok((await page.text()).includes('Find your kind of salon'));
}));
test('rejects invalid search and missing routes',()=>serve(async url=>{
  const bad=await fetch(url+'/api/search?location=A&radius=500');assert.equal(bad.status,400);
  const path=await fetch(url+'/private.txt');assert.equal(path.status,404);
  const post=await fetch(url+'/api/search',{method:'POST'});assert.equal(post.status,405);
}));
test('rate limiter protects provider requests',()=>serve(async url=>{
  let response;for(let i=0;i<61;i++)response=await fetch(url+'/api/search?location=London');
  assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60');
}));
test('cache coalesces concurrent requests and retries after a failed load', async () => {
  const cache = makeCache(60_000);
  let calls = 0;
  const load = () => { calls++; return Promise.resolve({ok: true}); };
  const [a, b] = await Promise.all([cache('same', load), cache('same', load)]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  await assert.rejects(() => cache('failed', () => Promise.reject(new Error('offline'))), /offline/);
  assert.deepEqual(await cache('failed', load), {ok: true});
  assert.equal(calls, 2);
});

test('expired failing cache request cannot evict a newer successful replacement', async () => {
  let now = 0;
  const cache = makeCache(50, () => now);
  let rejectOld;
  const old = cache('search', () => new Promise((_, reject) => { rejectOld = reject; }));
  await Promise.resolve(); // ensure the original loader has started
  now = 51;
  const fresh = cache('search', () => Promise.resolve('fresh'));
  assert.equal(await fresh, 'fresh');
  rejectOld(new Error('stale request failed'));
  await assert.rejects(old, /stale request failed/);
  let reloads = 0;
  assert.equal(await cache('search', () => { reloads++; return 'incorrect reload'; }), 'fresh');
  assert.equal(reloads, 0);
});

test('live HTTP search fails safely on malformed provider data then retries and caches success', async () => {
  let providerCalls = 0;
  const app = createAppServer({
    apiKey: 'server-only-test-key',
    fetcher: async (_url, options) => {
      providerCalls++;
      assert.equal(options.redirect, 'error');
      if (providerCalls === 1) return new Response('<html>bad gateway</html>', {headers: {'content-type': 'text/html'}});
      return Response.json({features: [
        {properties: {name: 'Real fixture salon', place_id: 'fixture-1', lat: 51.501, lon: -0.12, categories: ['service.beauty.hairdresser']}}
      ]});
    }
  });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${app.address().port}/api/search?lat=51.5&lon=-0.12&category=hair&radius=5`;
    const failed = await fetch(url);
    assert.equal(failed.status, 503);
    const body = await failed.text();
    assert.match(body, /PROVIDER_ERROR/);
    assert.ok(!body.includes('server-only-test-key'));
    const retried = await fetch(url);
    assert.equal(retried.status, 200);
    const data = await retried.json();
    assert.equal(data.mode, 'live');
    assert.equal(data.salons.length, 1);
    assert.equal(data.salons[0].name, 'Real fixture salon');
    assert.equal((await fetch(url)).status, 200);
    assert.equal(providerCalls, 2, 'success should be cached; failure must not be cached');
  } finally {
    await new Promise(resolve => app.close(resolve));
  }
});
