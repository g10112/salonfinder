const NAME='salonfinder-static-v1';
const ASSETS=['/','/index.html','/styles.css','/app.js','/manifest.webmanifest','/assets/icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);
  if(event.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;
  if(!ASSETS.includes(u.pathname))return;
  event.respondWith(fetch(event.request).then(res=>{if(res.ok){const clone=res.clone();caches.open(NAME).then(c=>c.put(event.request,clone));}return res;}).catch(()=>caches.match(event.request)));
});