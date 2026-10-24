import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ApiError,validateSearch,distanceKm,geoUrl,normalisePlace,searchDemo,searchLive} from '../server/core.mjs';
const params = obj=>new URLSearchParams(obj);
const VALID = {location:'Brighton, UK',category:'hair',radius:'5'};
test('normal input and allowed radius',()=>assert.deepEqual(validateSearch(params(VALID)),{category:'hair',radius:5,location:'Brighton, UK',coords:null}));
test('rejects invalid category, radius, location and coordinate injection',()=>{
  for(const obj of [{...VALID,category:'everything'},{...VALID,radius:'500'},{...VALID,location:'x'},{...VALID,lat:'NaN',lon:'0'},{...VALID,lat:'91',lon:'4'},{...VALID,lat:'1'},{...VALID,location:'test\nunsafe'}]) assert.throws(()=>validateSearch(params(obj)), ApiError);
});
test('accepts precise location and zero coordinates',()=>assert.deepEqual(validateSearch(params({category:'all',radius:3,lat:0,lon:0,location:''})).coords,{lat:0,lon:0,label:'Your chosen location'}));
test('distance is zero at same coordinates and ~111 km per degree latitude',()=>{assert.equal(distanceKm({lat:0,lon:0},{lat:0,lon:0}),0);assert.ok(Math.abs(distanceKm({lat:0,lon:0},{lat:1,lon:0})-111.2)<.2);});
test('provider key is URL encoded with a fixed HTTPS host',()=>{const u=geoUrl('/v2/places',{categories:'service.beauty',filter:'circle:-.2,51,5000'},'test key');assert.equal(u.hostname,'api.geoapify.com');assert.equal(u.searchParams.get('apiKey'),'test key');});
test('normalises provider result, sanitises links and strips unknown ratings',()=>{
  const x=normalisePlace({properties:{name:'  Toni & Guy ',place_id:'a',categories:['service.beauty.hairdresser'],lat:51.5,lon:-.12,website:'javascript:alert(1)',phone:'+44 123 456',wheelchair:'yes',formatted:'22 Example Road',rating:4.9}},{lat:51.5,lon:-.12});
  assert.equal(x.name,'Toni & Guy');assert.equal(x.website,null);assert.equal(x.phone,'+44 123 456');assert.equal(x.wheelchair,true);assert.equal(x.rating,undefined);
});
test('rejects tattoo-only, unnamed and malformed places',()=>{
  const c={lat:51.5,lon:-.12}; const base={properties:{name:'X',place_id:'xx',categories:['service.beauty.tattoo'],lat:51.5,lon:-.12}};
  assert.equal(normalisePlace(base,c),null);assert.equal(normalisePlace({properties:{...base.properties,name:''}},c),null);
});
test('demo data are all explicitly flagged fictional, distinct and scoped by radius and category',()=>{
  const list=searchDemo(validateSearch(params(VALID))); assert.equal(list.mode,'demo');
  assert.ok(list.salons.length);assert.ok(list.salons.every(s=>s.demo && s.category==='hair' && s.distanceKm<=5 && !s.website && !s.phone));
  assert.equal(new Set(list.salons.map(x=>x.id)).size,list.salons.length);
});
test('live adapter performs geocoding then place lookup with deduplication and radius filter',async()=>{
  const calls=[];
  const fetcher=async url=>{calls.push(url.toString()); const payload=calls.length===1?{results:[{lat:51.5,lon:-.12,formatted:'London UK'}]}:{features:[
    {properties:{name:'Good Hair',place_id:'one',lat:51.501,lon:-.121,categories:['service.beauty.hairdresser'],website:'https://example.com'}},
    {properties:{name:'Good Hair',place_id:'one',lat:51.501,lon:-.121,categories:['service.beauty.hairdresser']}},
    {properties:{name:'Too Far',place_id:'two',lat:52.9,lon:-.12,categories:['service.beauty.hairdresser']}}
  ]};return Response.json(payload);};
  const x=await searchLive(validateSearch(params(VALID)),'test',fetcher);
  assert.equal(x.salons.length,1);assert.equal(x.salons[0].website,'https://example.com/');assert.equal(calls.length,2);assert.ok(calls[1].includes('circle%3A'));
});
test('provider outage returns sanitized service failure without leaking key',async()=>{
  await assert.rejects(()=>searchLive(validateSearch(params(VALID)),'supersecret',async()=>{throw Error('supersecret leaked');}),err=>err.status===503 && !err.message.includes('supersecret'));
});
const COORDINATE_SEARCH = validateSearch(params({category:'hair', radius:'5', lat:'51.5', lon:'-0.12'}));
const searchWithResponse = response => searchLive(COORDINATE_SEARCH, 'secret-provider-key', async () => response);
const providerFailure = error => error instanceof ApiError && error.status === 503 && error.code === 'PROVIDER_ERROR' && !error.message.includes('secret-provider-key');

test('live requests reject redirects and carry a bounded abort signal', async () => {
  const calls = [];
  const result = await searchLive(COORDINATE_SEARCH, 'test-key', async (url, options) => {
    calls.push({url, options});
    return Response.json({features: []});
  });
  assert.equal(result.salons.length, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.hostname, 'api.geoapify.com');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.signal instanceof AbortSignal, true);
  assert.equal(calls[0].options.headers.Accept, 'application/json');
});

test('streaming provider response is rejected above 1.5 MB without Content-Length', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(900_000));
      controller.enqueue(new Uint8Array(700_000));
    },
    cancel() { cancelled = true; }
  });
  const response = new Response(stream, {headers: {'content-type': 'application/json'}});
  await assert.rejects(() => searchWithResponse(response), providerFailure);
  assert.equal(cancelled, true);
});

test('streaming limit is enforced even when Content-Length lies', async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1_500_001));
    }
  });
  const response = new Response(stream, {headers: {'content-length': '1', 'content-type': 'application/json'}});
  await assert.rejects(() => searchWithResponse(response), providerFailure);
});

test('oversized advertised response is rejected before reading its body', async () => {
  let cancelled = false;
  const stream = new ReadableStream({cancel() { cancelled = true; }});
  const response = new Response(stream, {headers: {'content-length': '1500001', 'content-type': 'application/json'}});
  await assert.rejects(() => searchWithResponse(response), providerFailure);
  assert.equal(cancelled, true);
});

test('unexpected MIME, malformed JSON, invalid UTF-8 and primitive JSON fail closed', async () => {
  const responses = [
    new Response('{"features":[]}', {headers: {'content-type': 'text/html'}}),
    new Response('{invalid', {headers: {'content-type': 'application/json'}}),
    new Response(new Uint8Array([0xff, 0xfe]), {headers: {'content-type': 'application/json'}}),
    Response.json(null),
    Response.json([1, 2, 3])
  ];
  for (const response of responses) await assert.rejects(() => searchWithResponse(response), providerFailure);
});

test('provider geocoding rejects null, blank, boolean and out-of-range coordinates', async () => {
  for (const lat of [null, '', false, 91, -91]) {
    let calls = 0;
    await assert.rejects(
      () => searchLive(validateSearch(params(VALID)), 'key', async () => {
        calls++;
        return Response.json({results: [{lat, lon: -0.12, formatted: 'Wrong place'}]});
      }),
      error => error instanceof ApiError && error.code === 'LOCATION_NOT_FOUND'
    );
    assert.equal(calls, 1, 'invalid geocode must not trigger places lookup');
  }
});

test('place normalisation refuses null, blank, boolean and out-of-range coordinates', () => {
  const center = {lat: 51.5, lon: -0.12};
  const place = lat => ({properties: {name: 'Bad position', place_id: 'id', categories: ['service.beauty.hairdresser'], lat, lon: -0.12}});
  for (const lat of [null, '', false, 91, -91]) assert.equal(normalisePlace(place(lat), center), null);
  assert.equal(normalisePlace(place('51.5'), center).lat, 51.5);
});

test('HTTP 200 provider error envelopes never appear as valid empty results', async () => {
  await assert.rejects(() => searchWithResponse(Response.json({error: 'quota exhausted'})), providerFailure);
  await assert.rejects(
    () => searchLive(validateSearch(params(VALID)), 'key', async () => Response.json({message: 'geocoder unavailable'})),
    providerFailure
  );
  const empty = await searchWithResponse(Response.json({features: []}));
  assert.equal(empty.mode, 'live');
  assert.deepEqual(empty.salons, []);
  await assert.rejects(
    () => searchLive(validateSearch(params(VALID)), 'key', async () => Response.json({results: []})),
    error => error instanceof ApiError && error.code === 'LOCATION_NOT_FOUND'
  );
});
