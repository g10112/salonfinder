import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../server/index.mjs';
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