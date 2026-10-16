import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ApiError, searchDemo, searchLive, validateSearch} from './core.mjs';

const root = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const mime = Object.freeze({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'});
const allowed = new Set(['/','/index.html','/styles.css','/app.js','/sw.js','/manifest.webmanifest','/robots.txt','/assets/icon.svg']);
const send = (res, status, body, type='application/json; charset=utf-8', extra={}) => {
  res.writeHead(status, {'Content-Type':type,'Cache-Control':type.includes('application/json')?'no-store':'public, max-age=1800','Content-Length':Buffer.byteLength(body),...extra}); res.end(body);
};
const json = (res,status,data,extra={}) => send(res,status,JSON.stringify(data),'application/json; charset=utf-8',extra);

/** Cache bounded by 120 entries and TTL; not designed as a multi-node shared cache. */
function makeCache(ttlMs=5*60_000) {
  const entries = new Map();
  return async (key, fn) => {
    const v = entries.get(key);
    if (v && v.expires > Date.now()) return v.promise;
    const promise = Promise.resolve().then(fn);
    entries.set(key,{expires:Date.now()+ttlMs,promise});
    if(entries.size>120)entries.delete(entries.keys().next().value);
    try{return await promise;}catch(e){entries.delete(key);throw e;}
  };
}
function makeLimiter() {
  const clients = new Map();
  return (ip) => {
    const now=Date.now(); const v=clients.get(ip)||{start:now,count:0};
    if(now-v.start>60_000){v.start=now;v.count=0;}
    v.count++;clients.set(ip,v);
    if(clients.size>4000) {for (const [k,x] of clients) {if(now-x.start>60_000)clients.delete(k);} if(clients.size>4000)clients.delete(clients.keys().next().value);}
    return v.count<=60;
  };
}
export function createAppServer({apiKey=process.env.GEOAPIFY_API_KEY||'', fetcher=fetch}={}) {
  const cache=makeCache(); const permitted=makeLimiter();
  return createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','geolocation=(self), camera=(), microphone=()');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests");
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {json(res,405,{error:'METHOD_NOT_ALLOWED',message:'This method is not supported.'},{Allow:'GET, HEAD'});return;}
      const url=new URL(req.url||'/', 'http://localhost'); const path=url.pathname;
      if (path === '/healthz') {json(res,200,{ok:true});return;}
      if (path === '/api/config') {json(res,200,{mode:apiKey?'live':'demo',maxRadiusKm:30,source:'Geoapify / OpenStreetMap'});return;}
      if (path === '/api/search') {
        if (!permitted(req.socket.remoteAddress||'unknown')) {json(res,429,{error:'RATE_LIMITED',message:'Too many searches. Try again in a minute.'},{'Retry-After':'60'});return;}
        const input=validateSearch(url.searchParams);
        const key=JSON.stringify(input);
        const data=await cache(key,()=>apiKey?searchLive(input,apiKey,fetcher):searchDemo(input));
        json(res,200,data);return;
      }
      if (!allowed.has(path)) {json(res,404,{error:'NOT_FOUND',message:'Page not found.'});return;}
      const filepath=resolve(root, '.'+path.replace(/^\/$/,'/index.html'));
      if (!filepath.startsWith(root+sep)) {json(res,404,{error:'NOT_FOUND'});return;}
      let buf;
      try { const stats=await stat(filepath); if(!stats.isFile()||stats.size>3_000_000)throw new Error('Invalid resource');buf=await readFile(filepath); }
      catch {json(res,404,{error:'NOT_FOUND',message:'File not found.'});return;}
      res.writeHead(200, {'Content-Type':mime[extname(filepath)]||'application/octet-stream','Content-Length':buf.length,'Cache-Control':path==='/sw.js'?'no-cache':'public, max-age=1800'});
      res.end(req.method==='HEAD'?undefined:buf);
    } catch (err) {
      const e=err instanceof ApiError?err:new ApiError(500,'INTERNAL_ERROR','Something went wrong. Please try again.');
      if(!(err instanceof ApiError))console.error('Request failed:',err?.name||'Error');
      if(!res.headersSent)json(res,e.status,{error:e.code,message:e.message});else res.end();
    }
  });
}
const runningDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runningDirectly) {
  const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be 1–65535');
  const server=createAppServer();
  server.listen(port,host,()=>console.log(`Salon Finder listening at http://${host}:${port} (${process.env.GEOAPIFY_API_KEY?'live Geoapify':'fictional demo'} mode)`));
  const stop=()=>server.close(()=>process.exit(0));process.once('SIGINT',stop);process.once('SIGTERM',stop);
}