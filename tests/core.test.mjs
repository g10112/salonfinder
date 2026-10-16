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
  ]};return {ok:true,headers:new Headers(),text:async()=>JSON.stringify(payload)};};
  const x=await searchLive(validateSearch(params(VALID)),'test',fetcher);
  assert.equal(x.salons.length,1);assert.equal(x.salons[0].website,'https://example.com/');assert.equal(calls.length,2);assert.ok(calls[1].includes('circle%3A'));
});
test('provider outage returns sanitized service failure without leaking key',async()=>{
  await assert.rejects(()=>searchLive(validateSearch(params(VALID)),'supersecret',async()=>{throw Error('supersecret leaked');}),err=>err.status===503 && !err.message.includes('supersecret'));
});